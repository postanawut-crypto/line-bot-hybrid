const express = require('express');
const line = require('@line/bot-sdk');
const axios = require('axios');

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
    // ตอบลูกค้า
    await client.replyMessage(event.replyToken, {
      type: 'text',
      text: '📋 ขอบคุณที่สนใจจองโต๊ะนะคะ!\nทีมงานจะติดต่อกลับภายใน 5 นาทีเพื่อยืนยันการจองค่ะ 🙏'
    });

    // แจ้งเตือนกลุ่ม
    await notifyGroup(userId, userText);

  } else {
    // ตอบอัตโนมัติ (ยังไม่มี Dialogflow — ตอบ default ก่อน)
    await client.replyMessage(event.replyToken, {
      type: 'text',
      text: 'สวัสดีค่ะ มีอะไรให้ช่วยไหมคะ? 😊'
    });
  }
}

async function notifyGroup(userId, userText) {
  try {
    const groupId = process.env.ADMIN_GROUP_ID;
    const time = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });

    await client.pushMessage(groupId, {
      type: 'text',
      text: `🔔 มีลูกค้าต้องการจองโต๊ะ!\n👤 User ID: ${userId}\n💬 ข้อความ: "${userText}"\n⏰ เวลา: ${time}\n\n👉 เข้า LINE OA เพื่อตอบกลับด้วยตัวเองได้เลยค่ะ`
    });
  } catch (err) {
    console.error('notify error:', err.message);
  }
}

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
