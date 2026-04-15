const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false, // TLS
  auth: {
    user: 'vutruong1405003@gmail.com',
    pass: 'ojassjvihnittnay',
  },
});

async function test() {
  try {
    const info = await transporter.sendMail({
      from: '"Vibly Test" <vutruong1405003@gmail.com>',
      to: 'vutruong2k3@gmail.com',
      subject: 'SMTP Diagnostic Test',
      text: 'If you receive this, the app password and SMTP config work perfectly!',
    });
    console.log('SUCCESS:', info.messageId);
  } catch (error) {
    console.error('ERROR:', error);
  }
}

test();
