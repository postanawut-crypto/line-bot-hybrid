const express = require('express');
const line = require('@line/bot-sdk');
const { SessionsClient } = require('@google-cloud/dialogflow');

const app = express();

const lineConfig = {
  channelSecret: process.env.LINE_CHANNEL_SECRET,
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
};

const client = new line.Client(lineConfig);

// Webhook
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

  if (userText.includes('จองโต๊ะ')) {
    await client.replyMessage(event.replyToken, {
      type: 'text',
      text: '📋 ขอบคุณที่สนใจจองโต๊ะนะคะ!\nทีมงานจะติดต่อกลับภายใน 5 นาทีเพื่อยืนยันการจองค่ะ 🙏'
    });
    await notifyGroup(userId, userText);

  } else {
    // ส่งไป Dialogflow
    const reply = await queryDialogflow(userText, userId);
    await client.replyMessage(event.replyToken, {
      type: 'text',
      text: reply
    });
  }
}

// Dialogflow
async function queryDialogflow(text, sessionId) {
  try {
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
    const sessionClient = new SessionsClient({ credentials });
    const projectId = process.env.DIALOGFLOW_PROJECT_ID;
    const sessionPath = sessionClient.projectAgentSessionPath(projectId, sessionId);

    const request = {
      session: sessionPath,
      queryInput: {
        text: { text, languageCode: 'th' }
      }
    };

    const [response] = await sessionClient.detectIntent(request);
    const result = response.queryResult;
    return result.fulfillmentText || 'ขอโทษค่ะ ไม่เข้าใจคำถาม ลองถามใหม่อีกครั้งนะคะ 😊';

  } catch (err) {
    console.error('Dialogflow error:', err.message);
    return 'ขออภัยค่ะ ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้งนะคะ';
  }
}

// แจ้งเตือนกลุ่ม
async function notifyGroup(userId, userText) {
  try {
    const groupId = process.env.ADMIN_GROUP_ID;
    const time = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });

    // ดึงชื่อผู้ใช้จาก LINE
    let displayName = userId; // default ถ้าดึงไม่ได้
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
