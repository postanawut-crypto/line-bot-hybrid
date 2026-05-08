async function sendLineNotify(userId, userText) {
  try {
    const groupId = process.env.ADMIN_GROUP_ID;

    const message = `🔔 มีลูกค้าต้องการจองโต๊ะ!
👤 User ID: ${userId}
💬 ข้อความ: "${userText}"
⏰ เวลา: ${new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}

👉 เข้า LINE OA เพื่อตอบกลับด้วยตัวเองได้เลยค่ะ`;

    await client.pushMessage(groupId, {
      type: 'text',
      text: message
    });

  } catch (err) {
    console.error('Push notify error:', err);
  }
}
