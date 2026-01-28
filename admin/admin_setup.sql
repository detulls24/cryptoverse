-- Скрипт для SQL Editor в Supabase
-- Эти функции позволяют администратору управлять любыми счетами и кошельками

-- 1. Функция изменения баланса банковской карты (в долларах)
CREATE OR REPLACE FUNCTION admin_update_bank_balance(p_user_id UUID, p_new_balance DECIMAL)
RETURNS void AS $$
BEGIN
  UPDATE bank_accounts
  SET balance = p_new_balance
  WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Функция заморозки/разморозки карты
CREATE OR REPLACE FUNCTION admin_toggle_bank_freeze(p_user_id UUID, p_freeze BOOLEAN)
RETURNS void AS $$
BEGIN
  UPDATE bank_accounts
  SET is_frozen = p_freeze
  WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Функция изменения баланса любого крипто-кошелька
CREATE OR REPLACE FUNCTION admin_update_wallet_balance(p_user_id UUID, p_coin_id TEXT, p_new_balance DECIMAL)
RETURNS void AS $$
BEGIN
  UPDATE wallets
  SET balance = p_new_balance
  WHERE user_id = p_user_id AND coin_id = LOWER(p_coin_id);
  
  -- Если записи нет - создаем её
  IF NOT FOUND THEN
    INSERT INTO wallets (user_id, coin_id, balance)
    VALUES (p_user_id, LOWER(p_coin_id), p_new_balance);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Функция полного удаления данных пользователя
CREATE OR REPLACE FUNCTION admin_delete_user_data(p_user_id UUID)
RETURNS void AS $$
BEGIN
  DELETE FROM wallets WHERE user_id = p_user_id;
  DELETE FROM bank_accounts WHERE user_id = p_user_id;
  DELETE FROM transactions WHERE user_id = p_user_id;
  DELETE FROM bank_transfers WHERE from_account IN (SELECT account_number FROM bank_accounts WHERE user_id = p_user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Примечание: SECURITY DEFINER позволяет функциям игнорировать RLS (Row Level Security),
-- что необходимо для административных действий.
