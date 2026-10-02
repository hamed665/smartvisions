-- 0174: ORDER-ENGINE Production FK index hardening
-- Adds only covering indexes for three composite foreign keys reported by
-- Supabase Production advisors after 0173. No Order semantics or authorities change.

create index order_line_fulfillment_line_order_fk_idx
  on public.order_line_fulfillment(organization_id,order_line_item_id,order_id);

create index order_return_lines_line_order_fk_idx
  on public.order_return_lines(organization_id,order_line_item_id,order_id);

create index order_return_lines_return_order_fk_idx
  on public.order_return_lines(organization_id,return_id,order_id);
