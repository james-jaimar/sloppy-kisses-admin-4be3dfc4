INSERT INTO public.message_templates (tenant_id,event_code,channel,name,subject,body,send_to,is_active,auto_send,body_format)
SELECT t.id, x.code, 'email'::public.comms_channel,x.name,x.subject,x.body,'customer',true,true,'text'
FROM public.tenants t CROSS JOIN (VALUES
('hotel_booking_requested','Hotel request received','Hotel stay {{booking.booking_number}} received — awaiting review','Hi {{customer.first_name}},

We have received your hotel stay request {{booking.booking_number}} for {{pet.name}}.

Your stay is not confirmed yet. Our team will review the intake information, vaccination documents and other requirements before confirming it. You can complete outstanding details and track progress in your customer portal:
{{booking.portal_url}}

Once staff confirms your stay, we will send the tax invoice with the applicable deposit and payment dates.

{{tenant.name}}'),
('hotel_booking_confirmed','Hotel stay confirmed by staff','Hotel stay {{booking.booking_number}} confirmed','Hi {{customer.first_name}},

Our team has reviewed your hotel stay {{booking.booking_number}} and confirmed it.

Your tax invoice will follow with the applicable deposit and payment dates. You can view your stay in your customer portal:
{{booking.portal_url}}

{{tenant.name}}')
) x(code,name,subject,body)
ON CONFLICT (tenant_id,event_code,channel) DO NOTHING;