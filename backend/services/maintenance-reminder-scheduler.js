'use strict';

const db = require('../db');
const { sendMaintenanceReminder, isSmtpConfigured } = require('../mailer');

let running = false;
let missingSmtpWarningShown = false;

async function sendDueReminders() {
  if (running) return;
  running = true;
  try {
    if (!isSmtpConfigured()) {
      if (!missingSmtpWarningShown) {
        console.warn('Rappels de maintenance par e-mail désactivés : configurez MAIL_HOST, MAIL_USER et MAIL_PASS (ou SMTP_HOST, SMTP_USER et SMTP_PASSWORD).');
        missingSmtpWarningShown = true;
      }
      return;
    }
    missingSmtpWarningShown = false;

    const due = await db.query(
      `SELECT ms.maintenance_id, ms.maintenance_number, ms.scheduled_at,
              m.material_code, m.designation, u.full_name, u.email
         FROM maintenance_sessions ms
         JOIN materials m ON m.material_id = ms.material_id
         JOIN users u ON u.user_id = ms.technician_id AND u.is_active = TRUE
        WHERE ms.status = 'PLANNED' AND ms.scheduled_at > UTC_TIMESTAMP()
          AND ms.scheduled_at <= DATE_ADD(UTC_TIMESTAMP(), INTERVAL 5 MINUTE)
          AND ms.reminder_email_sent_at IS NULL AND u.email IS NOT NULL AND u.email <> ''
          AND (ms.reminder_email_claimed_at IS NULL
               OR ms.reminder_email_claimed_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 MINUTE))
        ORDER BY ms.scheduled_at LIMIT 50`
    );

    for (const reminder of due) {
      const claim = await db.query(
        `UPDATE maintenance_sessions
            SET reminder_email_claimed_at = UTC_TIMESTAMP()
          WHERE maintenance_id = ? AND status = 'PLANNED'
            AND scheduled_at > UTC_TIMESTAMP()
            AND scheduled_at <= DATE_ADD(UTC_TIMESTAMP(), INTERVAL 5 MINUTE)
            AND reminder_email_sent_at IS NULL
            AND (reminder_email_claimed_at IS NULL
                 OR reminder_email_claimed_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 MINUTE))`,
        [reminder.maintenance_id]
      );
      if (!claim.affectedRows) continue;

      try {
        await sendMaintenanceReminder(reminder, { full_name: reminder.full_name, email: reminder.email });
        await db.query(
          `UPDATE maintenance_sessions
              SET reminder_email_sent_at = UTC_TIMESTAMP(), reminder_email_claimed_at = NULL
            WHERE maintenance_id = ? AND reminder_email_sent_at IS NULL`,
          [reminder.maintenance_id]
        );
        console.info(`Rappel de maintenance envoyé pour ${reminder.maintenance_number}.`);
      } catch (error) {
        await db.query(
          `UPDATE maintenance_sessions SET reminder_email_claimed_at = NULL
            WHERE maintenance_id = ? AND reminder_email_sent_at IS NULL`,
          [reminder.maintenance_id]
        ).catch(() => {});
        console.error(`Échec du rappel e-mail pour ${reminder.maintenance_number}:`, error.message);
      }
    }
  } catch (error) {
    console.error('Échec du cycle de rappels de maintenance:', error.message);
  } finally {
    running = false;
  }
}

function startMaintenanceReminderScheduler() {
  const timer = setInterval(sendDueReminders, 15_000);
  timer.unref();
  sendDueReminders();
}

module.exports = { startMaintenanceReminderScheduler };
