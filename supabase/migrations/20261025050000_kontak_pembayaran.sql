-- Who a checkout was for, so the team can follow up on WhatsApp when a payment stays unfinished.
-- Stored per payment: it is what Mayar received for that link. The latest one prefills the next checkout.
alter table public.payments
  add column customer_name text check (char_length(customer_name) between 1 and 100),
  add column customer_whatsapp text check (customer_whatsapp ~ '^[1-9][0-9]{9,14}$'),
  add column reminded_at timestamptz,
  add column reminder_count integer not null default 0 check (reminder_count >= 0);

-- Admin "Pembayaran": unfinished Mayar checkouts, newest first.
create index payments_unfinished_idx on public.payments (created_at desc)
  where mayar_id is not null and status in ('pending', 'expired');

-- One WhatsApp follow-up sent by an admin. Returns the new count, or null when the payment is gone or already paid.
create function public.mark_payment_reminded(p_id uuid)
returns integer language sql set search_path = '' as $$
  update public.payments set reminded_at = now(), reminder_count = reminder_count + 1
   where id = p_id and status <> 'paid'
  returning reminder_count;
$$;
revoke execute on function public.mark_payment_reminded(uuid) from public, anon, authenticated;
grant execute on function public.mark_payment_reminded(uuid) to service_role;
