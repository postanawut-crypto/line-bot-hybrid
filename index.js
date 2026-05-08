const express = require('express');
const line = require('@line/bot-sdk');
const { SessionsClient } = require('@google-cloud/dialogflow');

const app = express();

const lineConfig = {
  channelSecret: process.env.LINE_CHANNEL_SECRET,
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
};

const client = new line.Client(lineConfig);

// เก็บ User ที่อยู่ใน Manual Mode
const manualModeUsers = new Set();

app.post('/webhook', line.middleware(lineConfig), async (req, res) => {
  res.sendStatus(200);
  const events = req.body.events;
  for (const event of events) {
    if (event.type === 'message' && event.message.type === 'text') {
      await handleMessage(event);
    }
  }
});

async function handleMessage(event) {
  const userText = event.message.text.trim();
  const userId = event.source.userId;

  // ====== คำสั่งสำหรับแอดมิน (ส่งผ่าน OA เอง) ======
  // พิมพ์ "/manual @UserID" เพื่อเปิด Manual Mode
  // พิมพ์ "/auto @UserID" เพื่อปิด Manual Mode
  if (userText.startsWith('/manual ')) {
    const targetId = userText.replace('/manual ', '').trim();
    manualModeUsers.add(targetId);
    await client.replyMessage(event.replyToken, {
      type: 'text',
      text: `✅ เปิด Manual Mode สำหรับ ${targetId} แล้ว\nบอทจะไม่ตอบ User นี้อัตโนมัติ`
    });
    return;
  }

  if (userText.startsWith('/auto ')) {
    const targetId = userText.replace('/auto ', '').trim();
    manualModeUsers.delete(targetId);
    await client.replyMessage(event.replyToken, {
      type: 'text',
      text: `✅ ปิด Manual Mode สำหรับ ${targetId} แล้ว\nบอทจะตอบอัตโนมัติตามปกติ`
    });
    return;
  }

  // ====== ถ้า User อยู่ใน Manual Mode → บอทไม่ตอบ ======
  if (manualModeUsers.has(userId)) {
    return;
  }

  // ====== Logic ปกติ ======
  if (userText.includes('จองโต๊ะ')) {
    // เปิด Manual Mode ให้ User นี้อัตโนมัติ
    manualModeUsers.add(userId);

    await client.replyMessage(event.replyToken, {
      type: 'text',
      text: '📋 ขอบคุณที่สนใจจองโต๊ะนะคะ!\nทีมงานจะติดต่อกลับภายใน 5 นาทีเพื่อยืนยันการจองค่ะ 🙏'
    });
    await notifyGroup(userId, userText);

  } else {
    const messages = await queryDialogflow(userText, userId);
    await client.replyMessage(event.replyToken, messages);
  }
}

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

    for (const msg of result.fulfillmentMessages) {
      if (msg.text && msg.text.text && msg.text.text[0]) {
        messages.push({ type: 'text', text: msg.text.text[0] });
      }
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

async function notifyGroup(userId, userText) {
  try {
    const groupId = process.env.ADMIN_GROUP_ID;
    const time = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });

    let displayName = 'ไม่ทราบชื่อ';
    try {
      const profile = await client.getProfile(userId);
      displayName = profile.displayName;
    } catch (e) {
      console.error('getProfile error:', e.message);
    }

    await client.pushMessage(groupId, {
      type: 'text',
      text: `🔔 มีลูกค้าต้องการจองโต๊ะ!\n👤 ชื่อ: ${displayName}\n💬 ข้อความ: "${userText}"\n⏰ เวลา: ${time}\n\n🆔 User ID: ${userId}\n\n👉 พิมพ์ /auto ${userId}\nเมื่อคุยเสร็จแล้ว เพื่อให้บอทกลับมาตอบอัตโนมัติ`
    });
  } catch (err) {
    console.error('notify error:', err.message);
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
