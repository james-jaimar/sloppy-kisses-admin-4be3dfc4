INSERT INTO public.message_templates (tenant_id, event_code, channel, name, subject, body, send_to, is_active, auto_send)
SELECT t.id,
       'quote_sent',
       'email',
       'Hotel quote sent',
       'Your stay quote {{quote.number}} from {{tenant.name}}',
       'Hi {{customer.first_name}},

Thank you for thinking of us for {{pet.names}}. Your quote {{quote.number}} for {{quote.dates}} is attached, and we have pencilled the dates in for you until {{quote.valid_until}}.

A 50% deposit ({{quote.deposit}}) secures the booking and the balance is settled before arrival. Everything you need to know before the stay is below - if it is your first time with us, this is the short version of our accommodation form.',
       'customer',
       true,
       false
FROM public.tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM public.message_templates m
  WHERE m.tenant_id = t.id AND m.event_code = 'quote_sent' AND m.channel = 'email'
);