import { defaultSender, defaultReplyTo } from './emailConfig';
import { sendBrevoEmail, updateBrevoContact } from './brevo';

const PRO_LIST_ID = 11; // Brevo "Pro Users" list id

export const sendUpgradeConfirmationEmail = async ({ email, firstName }) => {
  const safeName = firstName || 'there';
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5;">
      <h2>🎉 You're now Set The Date Pro!</h2>
      <p>Hey ${safeName},</p>
      <p>Thanks for upgrading. Your organiser account now unlocks:</p>
      <ul>
        <li>Unlimited polls and date options</li>
        <li>Breakfast, lunch, and dinner scheduling</li>
        <li>Priority reminders to keep plans on track</li>
      </ul>
      <p>
        Jump back into your dashboard here:<br/>
        <a href="https://plan.setthedate.app" style="color:#2563eb;">https://plan.setthedate.app</a>
      </p>
      <p>If you have any questions, just reply to this email. I read every message.</p>
      <p>– Gavin<br/>Founder, Set The Date</p>
    </div>
  `;

  const textContent = `
Hey ${safeName},

Thanks for upgrading to Set The Date Pro! Your organiser account now has:
- Unlimited polls and date options
- Breakfast, lunch, and dinner scheduling
- Priority reminders to keep plans on track

Jump back in here: https://plan.setthedate.app

Questions? Just reply to this email – I read every message.

– Gavin
Founder, Set The Date
  `;

  await updateBrevoContact({
    email,
    attributes: { PlanType: 'premium', FIRSTNAME: firstName },
    listIds: [PRO_LIST_ID],
  });

  await sendBrevoEmail({
    sender: defaultSender,
    replyTo: defaultReplyTo,
    to: [{ email, name: firstName || undefined }],
    subject: '🎉 Your Set The Date Pro upgrade is confirmed',
    htmlContent,
    textContent,
  });
};

