import { router } from 'expo-router';

import type { ListItem } from '@/domain/types';

/** Volta uma tela; se a tela foi aberta direto (link ou web), vai para o início. */
export function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/** Abre um item de lista: faturas e pagamentos de fatura vão para o cartão; o resto para o lançamento. */
export function openItem(item: ListItem) {
  if ((item.invoice || item.invoicePayment) && item.cardId && item.invoiceMonth) {
    router.push({ pathname: '/cartao/[id]', params: { id: item.cardId, mes: item.invoiceMonth } });
    return;
  }
  router.push({ pathname: '/lancamento/[key]', params: { key: item.key } });
}
