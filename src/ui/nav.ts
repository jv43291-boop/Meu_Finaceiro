import { router } from 'expo-router';

/** Volta uma tela; se a tela foi aberta direto (link ou web), vai para o início. */
export function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}
