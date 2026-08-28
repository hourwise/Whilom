import { useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';
import PersonDetailScreen from '../../src/screens/PersonDetailScreen';
import { developmentDataSource } from '../../src/lib/fixtures';

export default function PersonRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const person = developmentDataSource.personById(id);
  if (!person) return <View><Text>Person not found</Text></View>;
  return <PersonDetailScreen person={person} />;
}
