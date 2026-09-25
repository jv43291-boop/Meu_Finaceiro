import { Alert, Platform } from 'react-native';

/** Alert.alert não faz nada na web; estes helpers funcionam nas duas plataformas. */
export function notify(title: string, message?: string): Promise<void> {
  if (Platform.OS === 'web') {
    window.alert(message ? `${title}\n\n${message}` : title);
    return Promise.resolve();
  }
  return new Promise((resolve) => Alert.alert(title, message, [{ text: 'OK', onPress: () => resolve() }], { onDismiss: () => resolve() }));
}

export function confirmAsk(title: string, message: string, okLabel = 'OK', destructive = false): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  return new Promise((resolve) =>
    Alert.alert(
      title,
      message,
      [
        { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
        { text: okLabel, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    ),
  );
}
