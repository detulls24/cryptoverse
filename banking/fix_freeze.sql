-- 1. Add Column frozen_by_admin
ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS frozen_by_admin BOOLEAN DEFAULT FALSE;

-- 2. Update Admin Freeze RPC
CREATE OR REPLACE FUNCTION admin_toggle_bank_freeze(p_user_id UUID, p_freeze BOOLEAN)
RETURNS void AS $$
BEGIN
  UPDATE bank_accounts
  SET is_frozen = p_freeze,
      frozen_by_admin = p_freeze -- If admin freezes, set this flag. If admin unfreezes, clear it.
  WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Update User Freeze Wallet RPC
CREATE OR REPLACE FUNCTION toggle_bank_card_freeze()
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE 
    current_state BOOLEAN;
    admin_block BOOLEAN;
BEGIN
    SELECT is_frozen, frozen_by_admin INTO current_state, admin_block 
    FROM bank_accounts 
    WHERE user_id = auth.uid();

    -- Check if blocked by admin
    IF admin_block THEN
        RAISE EXCEPTION 'Карта заблокирована администратором. Обратитесь в поддержку.';
    END IF;

    -- Toggle user freeze
    UPDATE bank_accounts 
    SET is_frozen = NOT current_state 
    WHERE user_id = auth.uid();

    RETURN NOT current_state;
END;
$$;
