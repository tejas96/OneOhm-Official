import { StyleSheet, View } from 'react-native';
import { SectionTitle } from '@/components/screen-header';
import { SERVICE } from '@/copy/service';
import { ServiceJobRow } from './service-job-row';
import { useMyServiceVisits } from './use-service-visits';

/** Today's service visits for the person they are given to; nothing when there are none. */
export function ServiceVisitsSection() {
  const jobs = useMyServiceVisits().data ?? [];
  if (jobs.length === 0) return null;
  return (
    <View style={styles.group}>
      <SectionTitle title={SERVICE.sectionTitle} count={jobs.length} />
      {jobs.map((job) => (
        <ServiceJobRow key={job.id} job={job} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({ group: { gap: 10 } });
