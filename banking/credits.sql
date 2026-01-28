-- ==========================================
-- NEO-BANK CREDIT SYSTEM & ASSET SEIZURE
-- ==========================================

-- 1. Create Loans Table
CREATE TABLE IF NOT EXISTS bank_loans (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    amount NUMERIC NOT NULL CHECK (amount > 0),
    amount_due NUMERIC NOT NULL CHECK (amount_due >= amount),
    interest_rate NUMERIC DEFAULT 0.05,
    due_date TIMESTAMP WITH TIME ZONE NOT NULL,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'repaid', 'defaulted')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 2. Enable RLS for Loans
ALTER TABLE bank_loans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own loans" 
ON bank_loans FOR SELECT USING (auth.uid() = user_id);

-- 3. Update User Assets for Seizure Support
-- We rely on user_assets table existing. If not, this might fail, but it should exist from Real Estate module.
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_assets' AND column_name = 'status') THEN
        ALTER TABLE user_assets ADD COLUMN status TEXT DEFAULT 'owned';
    END IF;
END $$;

-- 4. RPC: Take Loan
CREATE OR REPLACE FUNCTION take_bank_loan(p_amount NUMERIC)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    uid UUID := auth.uid();
    existing_loan UUID;
    due_dt TIMESTAMP WITH TIME ZONE;
    total_due NUMERIC;
BEGIN
    -- Check for active loan
    SELECT id INTO existing_loan FROM bank_loans WHERE user_id = uid AND status = 'active' LIMIT 1;
    IF existing_loan IS NOT NULL THEN
        RAISE EXCEPTION 'У вас уже есть активный кредит. Погасите его сначала.';
    END IF;

    -- Validate amount (e.g., max $500,000)
    IF p_amount > 500000 THEN
        RAISE EXCEPTION 'Максимальная сумма кредита $500,000';
    END IF;

    -- 7 days term, 5% interest
    due_dt := NOW() + INTERVAL '7 days';
    total_due := p_amount * 1.05;

    -- Issue Loan
    INSERT INTO bank_loans (user_id, amount, amount_due, due_date)
    VALUES (uid, p_amount, total_due, due_dt);

    -- Credit Balance
    UPDATE bank_accounts SET balance = balance + p_amount WHERE user_id = uid;

    -- Log Transfer
    INSERT INTO bank_transfers (from_account, to_account, amount, type, note)
    VALUES ('Neo-Bank Credit', (SELECT account_number FROM bank_accounts WHERE user_id = uid), p_amount, 'deposit', 'Кредитные средства');
END;
$$;

-- 5. RPC: Repay Loan
CREATE OR REPLACE FUNCTION repay_bank_loan()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    uid UUID := auth.uid();
    loan_record RECORD;
    user_bal NUMERIC;
BEGIN
    SELECT * INTO loan_record FROM bank_loans WHERE user_id = uid AND status = 'active' LIMIT 1;
    
    IF loan_record IS NULL THEN
        RAISE EXCEPTION 'Нет активного кредита для погашения';
    END IF;

    SELECT balance INTO user_bal FROM bank_accounts WHERE user_id = uid;

    IF user_bal < loan_record.amount_due THEN
        RAISE EXCEPTION 'Недостаточно средств. Необходима сумма: $%', loan_record.amount_due;
    END IF;

    -- Deduct Balance
    UPDATE bank_accounts SET balance = balance - loan_record.amount_due WHERE user_id = uid;

    -- Close Loan
    UPDATE bank_loans SET status = 'repaid' WHERE id = loan_record.id;

    -- Log Transfer
    INSERT INTO bank_transfers (from_account, to_account, amount, type, note)
    VALUES ((SELECT account_number FROM bank_accounts WHERE user_id = uid), 'Neo-Bank Credit', loan_record.amount_due, 'withdrawal', 'Погашение кредита');
END;
$$;

-- 6. RPC: Check Default & Confiscate
-- This should be called periodically or on login
CREATE OR REPLACE FUNCTION check_loan_default()
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    uid UUID := auth.uid();
    loan_record RECORD;
    assets_count INTEGER;
BEGIN
    SELECT * INTO loan_record FROM bank_loans 
    WHERE user_id = uid AND status = 'active' AND due_date < NOW();

    IF loan_record IS NULL THEN
        RETURN FALSE; -- No default
    END IF;

    -- === PUNISHMENT ===
    
    -- 1. Mark Loan Defaulted
    UPDATE bank_loans SET status = 'defaulted' WHERE id = loan_record.id;

    -- 2. Zero & Freeze Bank Account
    UPDATE bank_accounts SET balance = 0, is_frozen = TRUE WHERE user_id = uid;

    -- 3. Confiscate Real Estate (User Assets)
    UPDATE user_assets SET status = 'confiscated' WHERE user_id = uid AND status = 'owned';
    
    GET DIAGNOSTICS assets_count = ROW_COUNT;

    RETURN TRUE;
END;
$$;
