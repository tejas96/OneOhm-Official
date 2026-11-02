import {
  describeError,
  EmptyState,
  ErrorState,
  LoadingState,
  localHours,
  Screen,
  skyPhase,
  Text,
  useTheme,
} from '@oneohm/mobile-ui';
import { SunMedium } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { COMMON } from '@/copy/common';
import { HOME } from '@/copy/home';
import { Bell } from '@/features/alerts/bell';
import { BUSINESS_TIME_ZONE, longToday } from '@/lib/dates';
import { useCustomer } from '@/session/session-provider';
import { JourneyCard } from './journey-card';
import { NextStepCard, UpdatesCard, WaitingCard } from './progress-cards';
import { ProjectSwitcher } from './project-switcher';
import { ContactCard, ReferPrompt, SubsidyCard } from './support-cards';
import { TodoCard } from './todo-card';
import { useChosenProject, useHome } from './use-home';

/** The customer's solar journey: where things stand, what happens next, who to call. */
export function HomeScreen() {
  const theme = useTheme();
  const customer = useCustomer();
  const query = useHome();
  const { project, choose } = useChosenProject(query.data?.projects);
  const phase = skyPhase(localHours(new Date(), BUSINESS_TIME_ZONE));
  // A family member is greeted by their own name.
  const greeted = customer.viewer?.name ?? customer.name;
  const firstName = greeted.split(/\s+/)[0] ?? greeted;

  return (
    <Screen refreshing={query.isRefetching} onRefresh={() => void query.refetch()}>
      <View style={styles.header}>
        <View style={styles.dateRow}>
          <Text variant="mono" tone="tertiary">
            {longToday().toUpperCase()}
          </Text>
          <Bell />
        </View>
        <View>
          <Text variant="displayXl">{HOME.greeting[phase]},</Text>
          <Text variant="displayXl" italic color={theme.colors.accent}>
            {firstName}.
          </Text>
        </View>
      </View>

      {query.isPending ? <LoadingState label={HOME.loading} /> : null}
      {query.isError ? (
        <ErrorState
          title={COMMON.loadError}
          message={describeError(query.error)}
          retryLabel={COMMON.retry}
          onRetry={() => void query.refetch()}
        />
      ) : null}

      {query.data && !project ? (
        <EmptyState
          icon={<SunMedium size={22} color={theme.colors.accent} />}
          title={HOME.noProjectTitle}
          description={HOME.noProjectBody}
        />
      ) : null}

      {project && query.data ? (
        <>
          <ProjectSwitcher projects={query.data.projects} chosenId={project.id} onChoose={choose} />
          {project.waiting ? <WaitingCard waiting={project.waiting} /> : null}
          <TodoCard project={project} />
          <JourneyCard project={project} />
          <NextStepCard next={project.nextStep} />
          <SubsidyCard subsidy={project.subsidy} />
          <ContactCard contact={project.contact} whatsapp={query.data?.company.whatsapp ?? null} />
          <UpdatesCard updates={project.updates} />
          <ReferPrompt />
        </>
      ) : null}
      {query.data && !project ? <ReferPrompt /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 8, paddingTop: 8 },
  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
