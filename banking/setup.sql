-- ==========================================
-- BANKING SYSTEM CORE (FULL RESET & SYNC)
-- ==========================================

-- 1. DROP EVERYTHING (Clean start)
DROP TABLE IF EXISTS bank_transfers;
DROP TABLE IF EXISTS bank_accounts CASCADE;

-- 2. CREATE ACCOUNTS TABLE
CREATE TABLE bank_accounts (
    user_id UUID REFERENCES auth.users(id) PRIMARY KEY,
    account_number TEXT UNIQUE NOT NULL,
    cvc TEXT NOT NULL,
    holder_name TEXT NOT NULL,
    balance NUMERIC DEFAULT 0 CHECK (balance >= 0),
    is_frozen BOOLEAN DEFAULT FALSE,
    last_replaced_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW() - INTERVAL '24 hours'),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 3. CREATE TRANSFERS TABLE
CREATE TABLE bank_transfers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    from_account TEXT NOT NULL,
    to_account TEXT NOT NULL,
    amount NUMERIC NOT NULL CHECK (amount > 0),
    fee NUMERIC DEFAULT 0,
    note TEXT,
    type TEXT, -- 'p2p', 'withdrawal', 'deposit'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 4. ENABLE RLS
ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own bank account" 
ON bank_accounts FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own transfers" 
ON bank_transfers FOR SELECT USING (
    from_account IN (SELECT account_number FROM bank_accounts WHERE user_id = auth.uid()) OR
    to_account IN (SELECT account_number FROM bank_accounts WHERE user_id = auth.uid())
);

-- 5. RPC: Open Bank Account
CREATE OR REPLACE FUNCTION open_bank_account(p_holder_name TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    new_acc TEXT;
    new_cvc TEXT;
    uid UUID := auth.uid();
BEGIN
    IF EXISTS (SELECT 1 FROM bank_accounts WHERE user_id = uid) THEN RAISE EXCEPTION 'Счет уже открыт'; END IF;
    new_acc := LPAD(FLOOR(RANDOM() * 1000000000000)::TEXT, 12, '0');
    WHILE EXISTS (SELECT 1 FROM bank_accounts WHERE account_number = new_acc) LOOP
        new_acc := LPAD(FLOOR(RANDOM() * 1000000000000)::TEXT, 12, '0');
    END LOOP;
    new_cvc := LPAD(FLOOR(RANDOM() * 900 + 100)::TEXT, 3, '0');
    INSERT INTO bank_accounts (user_id, account_number, cvc, holder_name, balance)
    VALUES (uid, new_acc, new_cvc, p_holder_name, 0);
END;
$$;

-- 6. RPC: Toggle Freeze
CREATE OR REPLACE FUNCTION toggle_bank_card_freeze()
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE state BOOLEAN;
BEGIN
    SELECT is_frozen INTO state FROM bank_accounts WHERE user_id = auth.uid();
    UPDATE bank_accounts SET is_frozen = NOT is_frozen WHERE user_id = auth.uid();
    RETURN NOT state;
END;
$$;

-- 7. RPC: Replace Card
CREATE OR REPLACE FUNCTION replace_bank_card()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE new_acc TEXT; new_cvc TEXT; last_r TIMESTAMP WITH TIME ZONE;
BEGIN
    SELECT last_replaced_at INTO last_r FROM bank_accounts WHERE user_id = auth.uid();
    IF last_r > NOW() - INTERVAL '24 hours' THEN RAISE EXCEPTION 'Замена возможна раз в 24 часа'; END IF;
    new_acc := LPAD(FLOOR(RANDOM() * 1000000000000)::TEXT, 12, '0');
    WHILE EXISTS (SELECT 1 FROM bank_accounts WHERE account_number = new_acc) LOOP
        new_acc := LPAD(FLOOR(RANDOM() * 1000000000000)::TEXT, 12, '0');
    END LOOP;
    new_cvc := LPAD(FLOOR(RANDOM() * 900 + 100)::TEXT, 3, '0');
    UPDATE bank_accounts SET account_number = new_acc, cvc = new_cvc, last_replaced_at = NOW() WHERE user_id = auth.uid();
END;
$$;

-- 8. RPC: External Withdrawal (To Visa/Mastercard)
CREATE OR REPLACE FUNCTION withdraw_bank_funds(p_amount NUMERIC, p_card_target TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE source_acc TEXT; frozen BOOLEAN; fee NUMERIC; total NUMERIC; uid UUID := auth.uid();
BEGIN
    SELECT account_number, is_frozen INTO source_acc, frozen FROM bank_accounts WHERE user_id = uid;
    IF source_acc IS NULL THEN RAISE EXCEPTION 'Счет не найден'; END IF;
    IF frozen THEN RAISE EXCEPTION 'Карта заморожена'; END IF;
    IF p_amount < 10000 THEN fee := p_amount * 0.05; ELSE fee := p_amount * 0.025; END IF;
    total := p_amount + fee;
    IF (SELECT balance FROM bank_accounts WHERE user_id = uid) < total THEN RAISE EXCEPTION 'Недостаточно средств. Нужно $ % (вкл. комиссию $ %)', total, fee; END IF;
    UPDATE bank_accounts SET balance = balance - total WHERE user_id = uid;
    INSERT INTO bank_transfers (from_account, to_account, amount, fee, note, type)
    VALUES (source_acc, p_card_target, p_amount, fee, 'Вывод на карту ' || p_card_target, 'withdrawal');
END;
$$;

-- 9. RPC: P2P Transfer (Internal)
CREATE OR REPLACE FUNCTION transfer_bank_funds(p_target_number TEXT, p_amount NUMERIC, p_note TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE source_acc TEXT; sender_frozen BOOLEAN; receiver_frozen BOOLEAN; uid UUID := auth.uid();
BEGIN
    SELECT account_number, is_frozen INTO source_acc, sender_frozen FROM bank_accounts WHERE user_id = uid;
    
    IF source_acc IS NULL THEN RAISE EXCEPTION 'У вас нет счета'; END IF;
    IF sender_frozen THEN RAISE EXCEPTION 'Ваша карта заморожена. Перевод невозможен.'; END IF;
    IF source_acc = p_target_number THEN RAISE EXCEPTION 'Нельзя переводить самому себе'; END IF;
    
    -- Check recipient
    SELECT is_frozen INTO receiver_frozen FROM bank_accounts WHERE account_number = p_target_number;
    IF receiver_frozen IS NULL THEN RAISE EXCEPTION 'Счет получателя не найден'; END IF;
    IF receiver_frozen THEN RAISE EXCEPTION 'Карта получателя заморожена. Перевод невозможен.'; END IF;

    IF (SELECT balance FROM bank_accounts WHERE user_id = uid) < p_amount THEN RAISE EXCEPTION 'Недостаточно средств'; END IF;
    
    UPDATE bank_accounts SET balance = balance - p_amount WHERE account_number = source_acc;
    UPDATE bank_accounts SET balance = balance + p_amount WHERE account_number = p_target_number;
    
    INSERT INTO bank_transfers (from_account, to_account, amount, note, type)
    VALUES (source_acc, p_target_number, p_amount, p_note, 'p2p');
END;
$$;

-- 10. RPC: Portfolio to Bank Deposit
CREATE OR REPLACE FUNCTION deposit_to_bank_from_portfolio(p_coin_id TEXT, p_amount NUMERIC, p_usd_value NUMERIC)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE s_acc TEXT; frozen BOOLEAN; fee NUMERIC; final NUMERIC; uid UUID := auth.uid();
BEGIN
    SELECT account_number, is_frozen INTO s_acc, frozen FROM bank_accounts WHERE user_id = uid;
    IF s_acc IS NULL THEN RAISE EXCEPTION 'Сначала откройте счет Neo-Bank'; END IF;
    IF frozen THEN RAISE EXCEPTION 'Ваша карта Neo-Bank заморожена. Пополнение невозможно.'; END IF;
    
    IF (SELECT balance FROM wallets WHERE user_id = uid AND coin_id = p_coin_id) < p_amount THEN RAISE EXCEPTION 'Недостаточно средств в портфеле'; END IF;
    IF p_usd_value < 10000 THEN fee := p_usd_value * 0.05; ELSE fee := p_usd_value * 0.025; END IF;
    final := p_usd_value - fee;
    UPDATE wallets SET balance = balance - p_amount WHERE user_id = uid AND coin_id = p_coin_id;
    UPDATE bank_accounts SET balance = balance + final WHERE user_id = uid;
    INSERT INTO transactions (user_id, coin_id, amount, type, details) VALUES (uid, p_coin_id, -p_amount, 'withdrawal', 'Вывод на карту Neo-Bank');
    INSERT INTO bank_transfers (from_account, to_account, amount, fee, note, type) VALUES ('Portfolio', s_acc, final, fee, 'Пополнение из кошелька ' || p_coin_id, 'deposit');
END;
$$;

-- 12. RPC: Buy Crypto using Bank Card (1.25% Fee)
CREATE OR REPLACE FUNCTION buy_crypto_with_bank_card(p_coin_id TEXT, p_coin_amount NUMERIC, p_usd_cost NUMERIC)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE s_acc TEXT; frozen BOOLEAN; fee NUMERIC; total_usd NUMERIC; uid UUID := auth.uid();
BEGIN
    SELECT account_number, is_frozen INTO s_acc, frozen FROM bank_accounts WHERE user_id = uid;
    IF s_acc IS NULL THEN RAISE EXCEPTION 'Сначала откройте счет Neo-Bank'; END IF;
    IF frozen THEN RAISE EXCEPTION 'Ваша карта Neo-Bank заморожена'; END IF;
    
    fee := p_usd_cost * 0.0125; -- Fixed 1.25% fee
    total_usd := p_usd_cost + fee;
    
    IF (SELECT balance FROM bank_accounts WHERE user_id = uid) < total_usd THEN 
        RAISE EXCEPTION 'Недостаточно средств на карте. Нужно $ % (вкл. комиссию $ %)', total_usd, fee; 
    END IF;
    
    -- 1. Deduct from bank
    UPDATE bank_accounts SET balance = balance - total_usd WHERE user_id = uid;
    
    -- 2. Add to wallet (UPSERT logic)
    IF EXISTS (SELECT 1 FROM wallets WHERE user_id = uid AND coin_id = p_coin_id) THEN
        UPDATE wallets SET balance = balance + p_coin_amount WHERE user_id = uid AND coin_id = p_coin_id;
    ELSE
        INSERT INTO wallets (user_id, coin_id, balance) VALUES (uid, p_coin_id, p_coin_amount);
    END IF;
    
    -- 3. Logs
    INSERT INTO bank_transfers (from_account, to_account, amount, fee, note, type) 
    VALUES (s_acc, 'Crypto Portfolio', total_usd, fee, 'Покупка актива ' || p_coin_id, 'withdrawal');
    
    INSERT INTO transactions (user_id, coin_id, amount, type, details) 
    VALUES (uid, p_coin_id, p_coin_amount, 'deposit', 'Покупка через Neo-Bank');
END;
$$;
