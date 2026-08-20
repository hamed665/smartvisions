update public.cost_guard_settings
set low_cost_model = coalesce(low_cost_model, 'gpt-5.6-luna'),
    high_reasoning_model = coalesce(high_reasoning_model, 'gpt-5.6-terra'),
    updated_at = now()
where low_cost_model is null or high_reasoning_model is null;
