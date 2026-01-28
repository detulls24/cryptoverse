-- Function to get transactions with pagination
create or replace function admin_get_transactions_paginated(
    p_page integer,
    p_page_size integer
)
returns json as $$
declare
    v_offset integer;
    v_total integer;
    v_data json;
begin
    v_offset := (p_page - 1) * p_page_size;

    -- Get total count
    select count(*) into v_total from transactions;

    -- Get paginated data
    select json_agg(t) into v_data
    from (
        select * from transactions
        order by created_at desc
        limit p_page_size
        offset v_offset
    ) t;

    return json_build_object(
        'data', coalesce(v_data, '[]'::json),
        'total', v_total,
        'page', p_page,
        'page_size', p_page_size
    );
end;
$$ language plpgsql security definer;
