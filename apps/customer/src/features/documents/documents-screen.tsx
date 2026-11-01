import {
  Card,
  describeError,
  ErrorState,
  LoadingState,
  Screen,
  Text,
  unwrap,
} from '@oneohm/mobile-ui';
import { useQuery } from '@tanstack/react-query';
import { StyleSheet, View } from 'react-native';
import { api, keys } from '@/api/api';
import { SectionTitle } from '@/components/screen-header';
import { COMMON } from '@/copy/common';
import { DOCUMENTS } from '@/copy/money';
import { useHome } from '@/features/home/use-home';
import { useBilling } from '@/features/payments/use-billing';
import { longDate, momentDate } from '@/lib/dates';
import { FileRow } from './file-row';

/** The quotation, the agreements and reports that are ready, and the papers OneOhm shared. */
export function DocumentsScreen() {
  const home = useHome();
  const reports = useQuery({
    queryKey: keys.reports,
    queryFn: () => unwrap(api.customer.listReports()),
  });
  const files = useQuery({
    queryKey: keys.documents,
    queryFn: () => unwrap(api.customer.listDocuments()),
  });
  const billing = useBilling();
  const failed = home.error ?? reports.error ?? files.error;
  const invoices = (billing.data ?? []).flatMap((entry) =>
    entry.invoices
      .filter((invoice) => invoice.status === 'issued')
      .map((invoice) => ({ ...invoice, projectCode: entry.projectCode })),
  );
  const refresh = () => {
    void billing.refetch();
    void home.refetch();
    void reports.refetch();
    void files.refetch();
  };
  const projects = home.data?.projects ?? [];
  const many = projects.length > 1;

  return (
    <Screen refreshing={reports.isRefetching || files.isRefetching} onRefresh={refresh}>
      <Text variant="displayLg" style={styles.title}>
        {DOCUMENTS.title}
      </Text>
      {home.isPending || reports.isPending || files.isPending ? (
        <LoadingState label={DOCUMENTS.loading} />
      ) : null}
      {failed ? (
        <ErrorState
          title={COMMON.loadError}
          message={describeError(failed)}
          retryLabel={COMMON.retry}
          onRetry={refresh}
        />
      ) : null}

      {projects.length > 0 ? (
        <Section title={DOCUMENTS.quotationTitle}>
          {projects.map((project, index) => (
            <FileRow
              key={project.quotation.id}
              first={index === 0}
              title={project.quotation.number}
              meta={DOCUMENTS.quotationBody(project.quotation.number)}
              file={{
                path: `/v1/customer/quotations/${project.quotation.id}/pdf`,
                fileName: `${project.quotation.number}.pdf`,
                mimeType: 'application/pdf',
              }}
            />
          ))}
        </Section>
      ) : null}

      {invoices.length > 0 ? (
        <Section title={DOCUMENTS.invoiceTitle}>
          {invoices.map((invoice, index) => (
            <FileRow
              key={invoice.id}
              first={index === 0}
              title={invoice.number}
              meta={DOCUMENTS.invoiceBody(
                longDate(invoice.invoiceDate),
                many ? invoice.projectCode : null,
              )}
              file={{
                path: `/v1/customer/invoices/${invoice.id}/pdf`,
                fileName: `${invoice.number.replaceAll('/', '-')}.pdf`,
                mimeType: 'application/pdf',
              }}
            />
          ))}
        </Section>
      ) : null}

      {reports.data ? (
        <Section title={DOCUMENTS.reportsTitle} empty={DOCUMENTS.reportsEmpty}>
          {reports.data.map((report, index) => (
            <FileRow
              key={`${report.projectId}-${report.key}`}
              first={index === 0}
              title={report.name}
              meta={many ? report.projectCode : 'PDF'}
              file={{
                path: `/v1/customer/projects/${report.projectId}/reports/${report.key}/pdf`,
                fileName: `${report.projectCode}-${report.key}.pdf`,
                mimeType: 'application/pdf',
              }}
            />
          ))}
        </Section>
      ) : null}

      {files.data ? (
        <Section title={DOCUMENTS.filesTitle} empty={DOCUMENTS.filesEmpty}>
          {files.data.map((doc, index) => (
            <FileRow
              key={doc.id}
              first={index === 0}
              title={doc.name}
              meta={[
                DOCUMENTS.category[doc.category] ?? DOCUMENTS.category.other,
                momentDate(doc.createdAt),
                DOCUMENTS.size(Math.round(doc.sizeBytes / 1024)),
              ].join(' · ')}
              file={{
                path: `/v1/customer/documents/${doc.id}/file`,
                fileName: doc.name,
                mimeType: doc.contentType,
              }}
            />
          ))}
        </Section>
      ) : null}
    </Screen>
  );
}

function Section({
  title,
  empty,
  children,
}: {
  readonly title: string;
  readonly empty?: string;
  readonly children: readonly React.ReactNode[];
}) {
  return (
    <View style={styles.section}>
      <SectionTitle title={title.toUpperCase()} />
      <Card style={styles.card}>
        {children.length === 0 && empty ? (
          <Text variant="body" tone="secondary" style={styles.empty}>
            {empty}
          </Text>
        ) : (
          children
        )}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { paddingTop: 8 },
  section: { gap: 10 },
  card: { paddingVertical: 4 },
  empty: { paddingVertical: 12 },
});
