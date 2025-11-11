import { defaultSender, defaultReplyTo } from './emailConfig';
import { sendBrevoEmail, updateBrevoContact } from './brevo';

const PRO_LIST_ID = 11; // Brevo "Pro Users" list id

export const sendUpgradeConfirmationEmail = async ({ email, firstName }) => {
  const safeName = firstName || 'there';
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5;">
      <h2>🎉 Unlock complete!</h2>
      <p>Hey ${safeName},</p>
      <p>Thanks for supporting Set The Date. Your organiser subscription now includes:</p>
      <ul>
        <li>Unlimited date options for every event</li>
        <li>A hosted page you can share with the group</li>
        <li>3 months of Pro access for $2.99 (renews unless you cancel)</li>
      </ul>
      <p>
        Jump back into your event here:<br/>
        <a href="https://plan.setthedate.app" style="color:#2563eb;">https://plan.setthedate.app</a>
      </p>
      <p>Have questions or feedback? Just reply – I read every message.</p>
      <p>– Gavin<br/>Founder, Set The Date</p>
    </div>
  `;

  const textContent = `
Hey ${safeName},

Thanks for supporting Set The Date. Your organiser subscription now includes:
- Unlimited date options for every event
- A hosted page you can share with the group
- 3 months of Pro access for $2.99 (renews unless you cancel)

Jump back in here: https://plan.setthedate.app

Have questions or feedback? Just reply – I read every message.

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
    subject: '🎉 Unlock confirmed – unlimited dates + hosted page',
    htmlContent,
    textContent,
  });
};
