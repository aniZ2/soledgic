DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_check_creator_kyc_payout') THEN
    CREATE TRIGGER trg_check_creator_kyc_payout
      BEFORE INSERT ON public.transactions
      FOR EACH ROW
      WHEN (NEW.transaction_type = 'payout')
      EXECUTE FUNCTION check_creator_kyc_for_payout();
  END IF;
END $$;
