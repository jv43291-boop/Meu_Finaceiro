
import { currentMonthKey, todayISO } from '@/domain/dates';
import { useFinance } from '@/state/finance';
import { EntryForm } from '@/ui/EntryForm';
import { goBack } from '@/ui/nav';

export default function NewEntryScreen() {
  const { selectedMonth } = useFinance();
  // navegando por outro mês, o lançamento novo começa no dia 1 daquele mês
  const defaultDate = selectedMonth === currentMonthKey() ? todayISO() : `${selectedMonth}-01`;
  return <EntryForm defaultDate={defaultDate} onDone={() => goBack()} />;
}
