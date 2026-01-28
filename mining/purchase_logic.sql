-- Function to buy miners with quantity and payment method selection
CREATE OR REPLACE FUNCTION buy_miner_v2(
    p_miner_id UUID,
    p_quantity INTEGER,
    p_payment_method TEXT -- 'crypto' or 'bank'
)
RETURNS VOID AS $$
DECLARE
    v_user_id UUID;
    v_miner_price DECIMAL;
    v_miner_name TEXT;
    v_total_cost DECIMAL;
    v_user_balance DECIMAL;
BEGIN
    -- Get current user ID
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Validate quantity
    IF p_quantity <= 0 THEN
        RAISE EXCEPTION 'Quantity must be positive';
    END IF;

    -- Get miner details
    SELECT price, name INTO v_miner_price, v_miner_name
    FROM mining_equipment
    WHERE id = p_miner_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Miner not found';
    END IF;

    v_total_cost := v_miner_price * p_quantity;

    -- Payment Processing
    IF p_payment_method = 'crypto' THEN
        -- Check Crypto Balance (USDT)
        SELECT balance INTO v_user_balance
        FROM wallets
        WHERE user_id = v_user_id AND coin_id = 'usdt';

        -- Handle NULL balance (if wallet row doesn't exist yet but user has no balance)
        IF v_user_balance IS NULL THEN
            v_user_balance := 0;
        END IF;

        IF v_user_balance < v_total_cost THEN
            RAISE EXCEPTION 'Недостаточно средств на крипто-кошельке (USDT). Ваш баланс: % USDT, Требуется: % USDT', ROUND(v_user_balance, 2), v_total_cost;
        END IF;

        -- Deduct Crypto
        UPDATE wallets
        SET balance = balance - v_total_cost
        WHERE user_id = v_user_id AND coin_id = 'usdt';

        -- Log Transaction (Corrected columns: coin_id, type, amount, details)
        INSERT INTO transactions (user_id, coin_id, type, amount, details)
        VALUES (v_user_id, 'usdt', 'buy_miner', v_total_cost, 'Покупка ' || p_quantity || ' шт. ' || v_miner_name || ' (Crypto)');

    ELSIF p_payment_method = 'bank' THEN
        -- Check Bank Balance
        SELECT balance INTO v_user_balance
        FROM bank_accounts
        WHERE user_id = v_user_id;

        IF v_user_balance IS NULL THEN
            v_user_balance := 0;
        END IF;

        IF v_user_balance < v_total_cost THEN
            RAISE EXCEPTION 'Недостаточно средств на банковской карте. Ваш баланс: $%, Требуется: $%', ROUND(v_user_balance, 2), v_total_cost;
        END IF;

        -- Deduct Bank Balance
        UPDATE bank_accounts
        SET balance = balance - v_total_cost
        WHERE user_id = v_user_id;

        -- Log Transaction
        INSERT INTO transactions (user_id, coin_id, type, amount, details)
        VALUES (v_user_id, 'usd', 'buy_miner', v_total_cost, 'Покупка ' || p_quantity || ' шт. ' || v_miner_name || ' (Bank)');
        
    ELSE
        RAISE EXCEPTION 'Invalid payment method';
    END IF;

    -- Add Miners to User Inventory
    FOR i IN 1..p_quantity LOOP
        INSERT INTO user_mining (user_id, equipment_id, purchased_at, last_claim_at)
        VALUES (v_user_id, p_miner_id, NOW(), NOW());
    END LOOP;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
