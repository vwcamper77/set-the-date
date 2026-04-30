import { defaultSender, defaultReplyTo } from './emailConfig';
import { sendBrevoEmail, updateBrevoContact } from './brevo';

const PRO_LIST_ID = 11; // Brevo "Pro Users" list id

export const sendUpgradeConfirmationEmail = async ({ email, firstName }) => {
  const safeName = firstName || 'there';
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5;">
      <h2>Set The Date Pro is unlocked</h2>
      <p>Hey ${safeName},</p>
      <p>Thanks for supporting Set The Date. Pro is now linked to <strong>${email}</strong>.</p>
      <ul>
        <li>Unlimited date options for every event</li>
        <li>A hosted page you can share with the group</li>
        <li>3 months of Pro access for $2.99 (renews unless you cancel)</li>
      </ul>
      <p><strong>No account is needed to create Pro events.</strong> Start a new event and enter this same email address when asked for the organiser email. The Pro features will unlock automatically.</p>
      <p>
        Create your next event here:<br/>
        <a href="https://plan.setthedate.app" style="color:#2563eb;">https://plan.setthedate.app</a>
      </p>
      <p>
        If you want the optional Pro dashboard, create a portal password here:<br/>
        <a href="https://plan.setthedate.app/pro/login?mode=register" style="color:#2563eb;">https://plan.setthedate.app/pro/login?mode=register</a>
      </p>
      <p>Have questions, need to cancel, or want a refund? Just reply to this email.</p>
      <p>The Set The Date Team</p>
    </div>
  `;

  const textContent = `
Hey ${safeName},

Thanks for supporting Set The Date. Pro is now linked to ${email}.

Your organiser subscription now includes:
- Unlimited date options for every event
- A hosted page you can share with the group
- 3 months of Pro access for $2.99 (renews unless you cancel)

No account is needed to create Pro events. Start a new event and enter this same email address when asked for the organiser email. The Pro features will unlock automatically.

Create your next event here: https://plan.setthedate.app

Optional Pro dashboard: create a portal password here:
https://plan.setthedate.app/pro/login?mode=register

Have questions, need to cancel, or want a refund? Just reply to this email.

The Set The Date Team
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
    subject: 'Pro unlocked - unlimited dates + hosted page',
    htmlContent,
    textContent,
  });
};
