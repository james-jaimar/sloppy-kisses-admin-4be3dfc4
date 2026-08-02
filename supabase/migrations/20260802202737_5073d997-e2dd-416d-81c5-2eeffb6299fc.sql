SELECT cron.alter_job(jobid, active := false)
FROM cron.job
WHERE jobname IN ('send-invoice-reminders-daily', 'queue-booking-reminders-daily');