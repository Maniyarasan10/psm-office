import { useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';

/**
 * Standard back handler for every screen: pops the stack when there is
 * history, otherwise returns to the Home tab so root pages never get stuck
 * on a dead back button.
 */
export function useBackButton() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('MainTabs', { screen: 'Dashboard' });
    }
  }, [navigation]);
}

export default useBackButton;
