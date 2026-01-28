-- ФИНАЛЬНЫЙ КОД ДЛЯ SQL EDITOR (SUPABASE)
-- Это расширенная версия с поддержкой ПРИЧИН и ЛОГИРОВАНИЯ транзакций

-- 1. Функция пополнения/снятия банковского баланса с логом
CREATE OR REPLACE FUNCTION admin_alter_bank_balance(p_user_id UUID, p_amount DECIMAL, p_reason TEXT DEFAULT 'Админ-корректировка')
RETURNS void AS $$
DECLARE
    v_acc_num TEXT;
BEGIN
    -- Обновляем баланс
    UPDATE bank_accounts
    SET balance = balance + p_amount
    WHERE user_id = p_user_id
    RETURNING account_number INTO v_acc_num;

    -- Добавляем запись в логи банковских переводов
    IF v_acc_num IS NOT NULL THEN
        INSERT INTO bank_transfers (from_account, to_account, amount, note, type)
        VALUES ('SYSTEM', v_acc_num, ABS(p_amount), p_reason, CASE WHEN p_amount >= 0 THEN 'deposit' ELSE 'adjustment' END);
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Функция установки точного баланса карты
CREATE OR REPLACE FUNCTION admin_set_bank_balance(p_user_id UUID, p_new_balance DECIMAL)
RETURNS void AS $$
BEGIN
  UPDATE bank_accounts
  SET balance = p_new_balance
  WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Функция пополнения/снятия крипто-баланса с логом
CREATE OR REPLACE FUNCTION admin_alter_wallet_balance(p_user_id UUID, p_coin_id TEXT, p_amount DECIMAL, p_reason TEXT DEFAULT 'Админ-бонус')
RETURNS void AS $$
BEGIN
    -- Обновляем кошелек
    UPDATE wallets
    SET balance = balance + p_amount
    WHERE user_id = p_user_id AND coin_id = LOWER(p_coin_id);
    
    IF NOT FOUND THEN
        INSERT INTO wallets (user_id, coin_id, balance)
        VALUES (p_user_id, LOWER(p_coin_id), p_amount);
    END IF;

    -- Логируем в основную таблицу транзакций
    INSERT INTO transactions (user_id, coin_id, amount, type, details)
    VALUES (p_user_id, LOWER(p_coin_id), p_amount, 'admin_action', p_reason);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Функция установки точного крипто-баланса
CREATE OR REPLACE FUNCTION admin_update_wallet_balance(p_user_id UUID, p_coin_id TEXT, p_new_balance DECIMAL)
RETURNS void AS $$
BEGIN
  UPDATE wallets
  SET balance = p_new_balance
  WHERE user_id = p_user_id AND coin_id = LOWER(p_coin_id);
  
  IF NOT FOUND THEN
    INSERT INTO wallets (user_id, coin_id, balance)
    VALUES (p_user_id, LOWER(p_coin_id), p_new_balance);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Заморозка / Разморозка
CREATE OR REPLACE FUNCTION admin_toggle_bank_freeze(p_user_id UUID, p_freeze BOOLEAN)
RETURNS void AS $$
BEGIN
  UPDATE bank_accounts
  SET is_frozen = p_freeze
  WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Полная очистка данных
CREATE OR REPLACE FUNCTION admin_clear_user_data(p_user_id UUID)
RETURNS void AS $$
BEGIN
  DELETE FROM wallets WHERE user_id = p_user_id;
  DELETE FROM bank_accounts WHERE user_id = p_user_id;
  DELETE FROM transactions WHERE user_id = p_user_id;
  DELETE FROM bank_transfers WHERE from_account IN (SELECT account_number FROM bank_accounts WHERE user_id = p_user_id) OR to_account IN (SELECT account_number FROM bank_accounts WHERE user_id = p_user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Получение всех данных для админки (обход RLS)
-- 7. Получение всех данных для админки (обход RLS)
CREATE OR REPLACE FUNCTION admin_get_all_data()
RETURNS json AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'users', (SELECT json_agg(p) FROM (SELECT id, email, nickname FROM profiles) p),
    'wallets', (SELECT json_agg(w) FROM (SELECT * FROM wallets) w),
    'bank_accounts', (SELECT json_agg(b) FROM (SELECT * FROM bank_accounts) b),
    'transactions', (SELECT json_agg(t) FROM (SELECT * FROM transactions ORDER BY created_at DESC LIMIT 100) t),
    'bank_transfers', (SELECT json_agg(bt) FROM (SELECT * FROM bank_transfers ORDER BY created_at DESC LIMIT 100) bt)
  ) INTO result;
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
