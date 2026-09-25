import { Redirect } from 'expo-router';

/** A aba "+" só abre o formulário; se alguém cair aqui direto, manda para o formulário. */
export default function NewTab() {
  return <Redirect href="/lancamento/novo" />;
}
