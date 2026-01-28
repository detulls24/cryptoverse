-- КОД ДЛЯ SQL EDITOR (SUPABASE)
-- Удали старые функции, если они были, и вставь этот блок

-- 1. Пополнение / Снятие с банковского счета (Neo-Bank)
-- p_amount может быть положительным (пополнение) или отрицательным (снятие)
CREATE OR REPLACE FUNCTION admin_alter_bank_balance(p_user_id UUID, p_amount DECIMAL)
RETURNS void AS $$
BEGIN
  UPDATE bank_accounts
  SET balance = balance + p_amount
  WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Установка точного баланса карты
CREATE OR REPLACE FUNCTION admin_set_bank_balance(p_user_id UUID, p_new_balance DECIMAL)
RETURNS void AS $$
BEGIN
  UPDATE bank_accounts
  SET balance = p_new_balance
  WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Заморозка / Разморозка карты (Блокировка действий)
CREATE OR REPLACE FUNCTION admin_toggle_bank_freeze(p_user_id UUID, p_freeze BOOLEAN)
RETURNS void AS $$
BEGIN
  UPDATE bank_accounts
  SET is_frozen = p_freeze
  WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Пополнение / Снятие крипто-баланса (Wallets)
-- Если кошелька нет, он будет создан автоматически
CREATE OR REPLACE FUNCTION admin_alter_wallet_balance(p_user_id UUID, p_coin_id TEXT, p_amount DECIMAL)
RETURNS void AS $$
BEGIN
  UPDATE wallets
  SET balance = balance + p_amount
  WHERE user_id = p_user_id AND coin_id = LOWER(p_coin_id);
  
  IF NOT FOUND THEN
    INSERT INTO wallets (user_id, coin_id, balance)
    VALUES (p_user_id, LOWER(p_coin_id), p_amount);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Полное удаление (Блокировка доступа обычно через Auth, но это чистит данные)
CREATE OR REPLACE FUNCTION admin_clear_user_data(p_user_id UUID)
RETURNS void AS $$
BEGIN
  DELETE FROM wallets WHERE user_id = p_user_id;
  DELETE FROM bank_accounts WHERE user_id = p_user_id;
  DELETE FROM transactions WHERE user_id = p_user_id;
  -- Логи переводов чистим тоже
  DELETE FROM bank_transfers WHERE from_account IN (SELECT account_number FROM bank_accounts WHERE user_id = p_user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
