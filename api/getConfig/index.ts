export default async function (context: any, _req: any) {
  context.res = {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: {
      qnaEnabled: (process.env.VITE_QNA_ENABLED || 'true').toLowerCase() !== 'false',
      bugReportEnabled: (process.env.VITE_BUG_REPORT_ENABLED || 'true').toLowerCase() !== 'false',
      adminEnabled: (process.env.VITE_ADMIN_ENABLED || 'true').toLowerCase() !== 'false',
      bugReportEndpoint: process.env.VITE_BUG_REPORT_ENDPOINT || '',
      sessionDataEndpoint: process.env.VITE_SESSION_DATA_ENDPOINT || '',
    },
  };
}
