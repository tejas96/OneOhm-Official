import type { CustomerProject } from '@oneohm/api-contracts';
import { Button, Card, describeError, formatInr, Text, unwrap, useTheme } from '@oneohm/mobile-ui';
import { useQuery } from '@tanstack/react-query';
import { type Href, router } from 'expo-router';
import { FileUp, IndianRupee, Star } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { api } from '@/api/api';
import { FormAlert } from '@/components/form-alert';
import { HOME } from '@/copy/home';
import { PAYMENTS } from '@/copy/money';
import { STAGE_RATING } from '@/copy/ratings';
import { requestsKey } from '@/features/documents/requested-section';
import { canPayNow, usePayNow } from '@/features/payments/pay-now';
import { useStageRatings } from '@/features/ratings/use-stage-ratings';
import { lookup } from '@/i18n/copy';
import { type Todo, todosFor } from '@/lib/todos';

/**
 * What the customer needs to do for this home, in one calm card (PRD 5.1): money due
 * with Pay, papers OneOhm asked for, and ratings waiting. Hidden when there is nothing.
 */
export function TodoCard({ project }: { readonly project: CustomerProject }) {
  const theme = useTheme();
  const requests = useQuery({
    queryKey: requestsKey,
    queryFn: () => unwrap(api.customerDocumentRequests.listMyDocumentRequests()),
  });
  const ratings = useStageRatings();
  const todos = todosFor(project, requests.data ?? [], ratings.data ?? []);
  if (todos.length === 0) return null;
  return (
    <Card style={styles.card}>
      <Text variant="overline" tone="tertiary">
        {`${HOME.todoTitle.toUpperCase()} · ${todos.length}`}
      </Text>
      {todos.map((todo, index) => (
        <View
          key={todo.id}
          style={[
            styles.row,
            index > 0 && {
              borderTopColor: theme.colors.borderSubtle,
              borderTopWidth: StyleSheet.hairlineWidth,
            },
          ]}
        >
          <TodoRow todo={todo} projectId={project.id} />
        </View>
      ))}
    </Card>
  );
}

function TodoRow({ todo, projectId }: { readonly todo: Todo; readonly projectId: string }) {
  const theme = useTheme();
  const muted = theme.colors.textSecondary;
  if (todo.kind === 'payment') return <PaymentRow line={todo.line} />;
  if (todo.kind === 'paper')
    return (
      <Line
        icon={<FileUp size={18} color={muted} />}
        title={todo.request.title}
        meta={HOME.todoPaperMeta}
        action={HOME.todoSend}
        onPress={() => router.push('/documents' as Href)}
      />
    );
  if (todo.kind === 'rating') {
    const stage = lookup(STAGE_RATING.stage, todo.stage) ?? todo.stage;
    return (
      <Line
        icon={<Star size={18} color={muted} />}
        title={STAGE_RATING.cardTitle(stage)}
        meta={HOME.todoRatingMeta}
        action={HOME.todoRate}
        onPress={() =>
          router.push({ pathname: '/feedback/stage', params: { projectId, stage: todo.stage } })
        }
      />
    );
  }
  return (
    <Line
      icon={<Star size={18} color={muted} />}
      title={HOME.todoFeedback}
      meta={HOME.todoRatingMeta}
      action={HOME.todoRate}
      onPress={() => router.push({ pathname: '/feedback/[projectId]', params: { projectId } })}
    />
  );
}

/** Money due: Pay opens the payment page when online payments are on; otherwise See. */
function PaymentRow({
  line,
}: {
  readonly line: CustomerProject['payments']['milestones'][number];
}) {
  const theme = useTheme();
  const pay = usePayNow(line);
  const payable = canPayNow(line);
  return (
    <View style={styles.stack}>
      <Line
        icon={<IndianRupee size={18} color={theme.colors.textSecondary} />}
        title={PAYMENTS.milestone(line.key, line.label)}
        meta={HOME.todoPaymentMeta(formatInr(line.amountPaise - line.paidPaise))}
        action={payable ? HOME.todoPay : HOME.todoSee}
        primary={payable}
        pending={pay.isPending}
        onPress={() => (payable ? pay.mutate() : router.push('/payments' as Href))}
      />
      <FormAlert message={pay.error ? describeError(pay.error) : null} />
    </View>
  );
}

function Line({
  icon,
  title,
  meta,
  action,
  onPress,
  primary = false,
  pending = false,
}: {
  readonly icon: ReactNode;
  readonly title: string;
  readonly meta: string;
  readonly action: string;
  readonly onPress: () => void;
  readonly primary?: boolean;
  readonly pending?: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={styles.line}>
      <View style={[styles.icon, { backgroundColor: theme.colors.surfaceSunken }]}>{icon}</View>
      <View style={styles.text}>
        <Text variant="body" numberOfLines={2}>
          {title}
        </Text>
        <Text variant="label" tone="tertiary">
          {meta}
        </Text>
      </View>
      <Button
        label={action}
        size="sm"
        variant={primary ? 'primary' : 'secondary'}
        pending={pending}
        onPress={onPress}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 4 },
  row: { paddingVertical: 12 },
  stack: { gap: 8 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 2 },
});
