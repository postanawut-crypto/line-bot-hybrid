const express = require('express');
const line = require('@line/bot-sdk');
const dialogflow = require('dialogflow');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');

const app = express();

// ====== CONFIG ======
const lineConfig = {
  channelSecret: process.env.LINE_CHANNEL_SECRET,
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
};
const client = new line.Client(lineConfig);
const DIALOGFLOW_PROJECT_ID = process.env.DIALOGFLOW_PROJECT_ID;
const NOTIFY_TOKEN = process.env.LINE_NOTIFY_TOKEN;

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
    // ตอบลูกค้าอัตโนมัติก่อน
    await client.replyMessage(event.replyToken, {
      type: 'text',
      text: '📋 ขอบคุณที่สนใจจองโต๊ะนะคะ!\nทีมงานจะติดต่อกลับภายใน 5 นาทีเพื่อยืนยันการจองค่ะ 🙏'
    });

    // แจ้งเตือนคุณผ่าน LINE Notify
    await sendLineNotify(userId, userText);

  } else {
    // ส่งไป Dialogflow
    const reply = await queryDialogflow(userText, userId);
    await client.replyMessage(event.replyToken, {
      type: 'text',
      text: reply
    });
  }
}

// ====== DIALOGFLOW ======
async function queryDialogflow(text, sessionId) {
  try {
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
    const sessionClient = new dialogflow.SessionsClient({ credentials });
    const sessionPath = sessionClient.sessionPath(DIALOGFLOW_PROJECT_ID, sessionId);

    const request = {
      session: sessionPath,
      queryInput: {
        text: { text, languageCode: 'th' }
      }
    };

    const responses = await sessionClient.detectIntent(request);
    const result = responses[0].queryResult;
    return result.fulfillmentText || 'ขอโทษค่ะ ไม่เข้าใจคำถาม ลองถามใหม่อีกครั้งนะคะ';
  } catch (err) {
    console.error('Dialogflow error:', err);
    return 'ขออภัยค่ะ ระบบขัดข้องชั่วคราว';
  }
}

// ====== LINE NOTIFY ======
async function sendLineNotify(userId, userText) {
  try {
    const message = `
🔔 มีลูกค้าต้องการจองโต๊ะ!
👤 User ID: ${userId}
💬 ข้อความ: "${userText}"
⏰ เวลา: ${new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}

👉 กรุณาเข้า LINE OA เพื่อตอบกลับแบบ Manual`;

    await axios.post(
      'https://notify-api.line.me/api/notify',
      new URLSearchParams({ message }),
      { headers: { Authorization: `Bearer ${NOTIFY_TOKEN}` } }
    );
  } catch (err) {
    console.error('LINE Notify error:', err);
  }
}

// ====== START SERVER ======
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
