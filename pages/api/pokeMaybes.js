// pages/api/pokeMaybes.js
import { db as adminDb } from "@/lib/firebaseAdmin";
import { defaultSender, defaultReplyTo } from "@/lib/emailConfig";
import { sendBrevoEmail } from "@/lib/brevo";
import { format, parseISO } from "date-fns";

const baseAppUrl =
  process.env.APP_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  "https://plan.setthedate.app";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const { pollId, dateISO, token } = req.body || {};

    if (!pollId || !dateISO || !token) {
      return res.status(400).json({ ok: false, error: "Missing fields." });
    }

    const pollRef = adminDb.collection("polls").doc(pollId);

    // 1) Claim the poke in a transaction to prevent double send
    const claim = await adminDb.runTransaction(async (tx) => {
      const pollSnap = await tx.get(pollRef);

      if (!pollSnap.exists) {
        return { ok: false, status: 404, error: "Poll not found." };
      }

      const poll = pollSnap.data() || {};

      if (!poll?.editToken || token !== poll.editToken) {
        return { ok: false, status: 403, error: "Not authorised." };
      }

      const key = String(dateISO);
      const existing = poll?.nudges?.maybePokeByOption?.[key]?.sentAt;

      if (existing) {
        return { ok: false, status: 409, error: "Already poked." };
      }

      tx.set(
        pollRef,
        {
          nudges: {
            maybePokeByOption: {
              [key]: {
                sentAt: new Date().toISOString(),
                sentCount: 0,
              },
            },
          },
        },
        { merge: true }
      );

      return { ok: true, poll, key };
    });

    if (!claim.ok) {
      return res
        .status(claim.status || 400)
        .json({ ok: false, error: claim.error || "Error" });
    }

    const poll = claim.poll || {};
    const key = claim.key || String(dateISO);

    // 2) Collect MAYBE voters for this date option (dedupe by email)
    const votesSnap = await pollRef.collection("votes").get();
    const maybeTargetsMap = new Map();

    votesSnap.forEach((doc) => {
      const v = doc.data() || {};
      const vote = v?.votes?.[dateISO];
      const email = (v?.email || "").trim();

      if (vote === "maybe" && email) {
        const name = (v.displayName || v.name || "").trim();
        const dedupKey = email.toLowerCase();

        if (!maybeTargetsMap.has(dedupKey)) {
          maybeTargetsMap.set(dedupKey, { email, name: name || undefined });
        }
      }
    });

    const recipients = Array.from(maybeTargetsMap.values());

    // 3) Build email content
    const pollUrl = `${baseAppUrl}/poll/${pollId}`;
    const eventTitle = poll.eventTitle || "your event";
    const locationText = poll.location ? ` in ${poll.location}` : "";
    const organiserName = poll.organiserFirstName || "Your organiser";

    let dateHuman = "";
    try {
      dateHuman = format(parseISO(dateISO), "EEEE do MMMM yyyy");
    } catch {
      dateHuman = dateISO;
    }

    const subject = `Quick nudge for "${eventTitle}"`;

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; line-height: 1.5;">
        <p>Hi there,</p>
        <p>${organiserName} asked us to check if you can now confirm for <strong>${eventTitle}</strong>${locationText}.</p>
        <p>This date is in 2 days: <strong>${dateHuman}</strong>.</p>
        <p>If you can make it, please update your vote to YES:</p>
        <p style="margin: 16px 0;">
          <a href="${pollUrl}" style="background: #f59e0b; color: #111827; padding: 12px 20px; border-radius: 9999px; text-decoration: none; font-weight: bold;">
            Update my vote
          </a>
        </p>
        <p>If you still can't make it, no worries - your MAYBE will stay as is.</p>
        <p style="margin-top: 30px; color: #6b7280; font-size: 13px;">Sent via Set The Date.</p>
      </div>
    `;

    const textContent = [
      "Hi there,",
      `${organiserName} asked us to check if you can now confirm for ${eventTitle}${locationText}.`,
      `This date is in 2 days: ${dateHuman}.`,
      "If you can make it, please update your vote to YES:",
      `Update your vote here: ${pollUrl}`,
      "If you still can't make it, no worries - your MAYBE will stay as is.",
      "",
      "Sent via Set The Date.",
    ].join("\n");

    // 4) Send emails (one per recipient for safety)
    let sentCount = 0;

    for (const r of recipients) {
      await sendBrevoEmail({
        sender: defaultSender,
        replyTo: defaultReplyTo,
        to: [{ email: r.email, name: r.name }],
        subject,
        htmlContent,
        textContent,
      });
      sentCount += 1;
    }

    // 5) Update sentCount after sending
    await pollRef.set(
      {
        nudges: {
          maybePokeByOption: {
            [key]: {
              sentCount,
            },
          },
        },
      },
      { merge: true }
    );

    return res.status(200).json({ ok: true, sentCount });
  } catch (e) {
    console.error("pokeMaybes error", e);
    return res.status(500).json({ ok: false, error: e?.message || "Server error." });
  }
}
