const express = require('express');
const line = require('@line/bot-sdk');
const { SessionsClient } = require('@google-cloud/dialogflow');

const app = express();

const lineConfig = {
  channelSecret: process.env.LINE_CHANNEL_SECRET,
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
};

const client = new line.Client(lineConfig);

// ====== WEBHOOK ======
app.post('/webhook', line.middleware(lineConfig), async (req, res) => {
  res.sendStatus(200);
  const events = req.body.events;
  for (const event of events) {
    if (event.type === 'message' && event.message.type === 'text') {
      await handleMessage(event);
    }
  }
});

// ====== LOGIC หลัก ======
async function handleMessage(event) {
  const userText = event.message.text.trim();
  const userId = event.source.userId;

  if (userText.includes('จองโต๊ะ')) {
    // ตอบลูกค้า
    await client.replyMessage(event.replyToken, {
      type: 'text',
      text: '📋 ขอบคุณที่สนใจจองโต๊ะนะคะ!\nทีมงานจะติดต่อกลับภายใน 5 นาทีเพื่อยืนยันการจองค่ะ 🙏'
    });
    // แจ้งเตือนกลุ่ม
    await notifyGroup(userId, userText);

  } else {
    // ส่งไป Dialogflow
    const messages = await queryDialogflow(userText, userId);
    await client.replyMessage(event.replyToken, messages);
  }
}

// ====== DIALOGFLOW ======
async function queryDialogflow(text, sessionId) {
  try {
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
    const sessionClient = new SessionsClient({ credentials });
    const projectId = process.env.DIALOGFLOW_PROJECT_ID;
    const sessionPath = sessionClient.projectAgentSessionPath(projectId, sessionId);

    const [response] = await sessionClient.detectIntent({
      session: sessionPath,
      queryInput: { text: { text, languageCode: 'th' } }
    });

    const result = response.queryResult;
    const messages = [];

    // วนดู fulfillmentMessages ทั้งหมด
    for (const msg of result.fulfillmentMessages) {
      // ข้อความปกติ
      if (msg.text && msg.text.text && msg.text.text[0]) {
        messages.push({ type: 'text', text: msg.text.text[0] });
      }
      // Custom Payload (รูปภาพ ฯลฯ)
      if (msg.payload) {
        const payload = msg.payload.fields?.line?.structValue?.fields;
        if (payload) {
          const type = payload.type?.stringValue;
          if (type === 'image') {
            messages.push({
              type: 'image',
              originalContentUrl: payload.originalContentUrl?.stringValue,
              previewImageUrl: payload.previewImageUrl?.stringValue
            });
          }
        }
      }
    }

    // ถ้าไม่มีอะไรเลย ใช้ fulfillmentText
    if (messages.length === 0) {
      messages.push({
        type: 'text',
        text: result.fulfillmentText || 'ขอโทษค่ะ ไม่เข้าใจคำถาม ลองถามใหม่อีกครั้งนะคะ 😊'
      });
    }

    return messages;

  } catch (err) {
    console.error('Dialogflow error:', err.message);
    return [{ type: 'text', text: 'ขออภัยค่ะ ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้งนะคะ' }];
  }
}

// ====== แจ้งเตือนกลุ่ม ======
async function notifyGroup(userId, userText) {
  try {
    const groupId = process.env.ADMIN_GROUP_ID;
    const time = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });

    // ดึงชื่อจาก LINE
    let displayName = 'ไม่ทราบชื่อ';
    try {
      const profile = await client.getProfile(userId);
      displayName = profile.displayName;
    } catch (e) {
      console.error('getProfile error:', e.message);
    }

    await client.pushMessage(groupId, {
      type: 'text',
      text: `🔔 มีลูกค้าต้องการจองโต๊ะ!\n👤 ชื่อ: ${displayName}\n💬 ข้อความ: "${userText}"\n⏰ เวลา: ${time}\n\n👉 เข้า LINE OA เพื่อตอบกลับด้วยตัวเองได้เลยค่ะ`
    });
  } catch (err) {
    console.error('notify error:', err.message);
  }
}

// ====== START SERVER ======
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
