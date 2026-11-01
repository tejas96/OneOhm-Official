import type { ServiceVisit } from '@oneohm/api-contracts';
import { Button, Card, StatusPill, Text, useTheme } from '@oneohm/mobile-ui';
import { Navigation, Phone } from 'lucide-react-native';
import { Linking, StyleSheet, View } from 'react-native';
import { SERVICE } from '@/copy/service';
import { AttachmentTile } from '@/features/tasks/evidence/evidence-tiles';
import { shortDate, shortMoment } from '@/lib/dates';
import { slaTone } from './service-times';

/** What the customer said, with the photos they added when raising it. */
export function ProblemCard({ visit }: { readonly visit: ServiceVisit }) {
  return (
    <Card style={styles.card}>
      <Text variant="overline" tone="tertiary">
        {SERVICE.problem.toUpperCase()}
      </Text>
      <Text variant="body">{visit.description}</Text>
      {visit.customerPhotos.length > 0 ? (
        <>
          <Text variant="label" tone="tertiary">
            {SERVICE.customerPhotos(visit.customerPhotos.length)}
          </Text>
          <View style={styles.grid}>
            {visit.customerPhotos.map((photo) => (
              <AttachmentTile
                key={photo.id}
                // Customers can add photos only (JPEG, PNG, WebP or HEIC).
                file={{ ...photo, contentType: 'image/jpeg', sizeBytes: 0, createdAt: '' }}
                removable={false}
                removing={false}
                onRemove={() => undefined}
              />
            ))}
          </View>
        </>
      ) : null}
    </Card>
  );
}

/** Who to meet and where: call the customer, or open directions to the site. */
export function PlaceCard({ visit }: { readonly visit: ServiceVisit }) {
  const theme = useTheme();
  const place = visit.place;
  const address = place ? [place.address, place.city].join(', ') : null;
  return (
    <Card style={styles.card}>
      <Text variant="overline" tone="tertiary">
        {SERVICE.customer.toUpperCase()}
      </Text>
      <View style={styles.gapSm}>
        <Text variant="titleMd">{visit.customer.name}</Text>
        <Text variant="bodySm" tone="secondary">
          {place ? `${place.label} · ${address}` : SERVICE.noPlace}
        </Text>
      </View>
      <View style={styles.row}>
        <Button
          label={SERVICE.call(visit.customer.name.split(' ')[0] ?? '')}
          variant="secondary"
          size="sm"
          icon={<Phone size={16} color={theme.colors.textPrimary} />}
          onPress={() => void Linking.openURL(`tel:${visit.customer.phone}`)}
          style={styles.flex}
        />
        {address ? (
          <Button
            label={SERVICE.directions}
            variant="secondary"
            size="sm"
            icon={<Navigation size={16} color={theme.colors.textPrimary} />}
            onPress={() =>
              void Linking.openURL(
                `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`,
              )
            }
            style={styles.flex}
          />
        ) : null}
      </View>
    </Card>
  );
}

type Sla = ServiceVisit['sla']['response'];

function PromiseLine({
  label,
  when,
  state,
}: {
  readonly label: string;
  readonly when: string;
  readonly state: Sla;
}) {
  return (
    <View style={styles.promise}>
      <View style={styles.gapXs}>
        <Text variant="label" tone="tertiary">
          {label}
        </Text>
        <Text variant="bodySm">{when}</Text>
      </View>
      {state ? <StatusPill size="sm" tone={slaTone(state)} label={SERVICE.sla[state]} /> : null}
    </View>
  );
}

/** The times OneOhm promised the customer, and where each stands (PRD 7.2). */
export function PromisesCard({ visit }: { readonly visit: ServiceVisit }) {
  const reply = visit.respondedAt
    ? SERVICE.answered(shortMoment(visit.respondedAt))
    : visit.responseDueAt
      ? shortMoment(visit.responseDueAt)
      : null;
  if (!reply && !visit.resolutionDueAt && !visit.scheduledFor) return null;
  return (
    <Card style={styles.card}>
      <Text variant="overline" tone="tertiary">
        {SERVICE.promised.toUpperCase()}
      </Text>
      {visit.scheduledFor ? (
        <PromiseLine label={SERVICE.visitDay} when={shortDate(visit.scheduledFor)} state={null} />
      ) : null}
      {reply ? (
        <PromiseLine label={SERVICE.replyBy} when={reply} state={visit.sla.response} />
      ) : null}
      {visit.resolutionDueAt ? (
        <PromiseLine
          label={SERVICE.fixBy}
          when={shortMoment(visit.resolutionDueAt)}
          state={visit.sla.resolution}
        />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  gapSm: { gap: 4 },
  gapXs: { gap: 2, flexShrink: 1 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  flex: { flexGrow: 1, flexBasis: 140 },
  promise: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
});
