// TODO: replace with ctx.meta.getFunctionMetadata() in 1.36+
export async function getFunctionMetadata(): Promise<{
  name: string;
  componentPath: string;
}> {
  const syscalls = (global as any).Convex;
  return JSON.parse(
    await syscalls.asyncSyscall("1.0/getFunctionMetadata", JSON.stringify({})),
  );
}

type TransactionMetric = {
  used: number;
  remaining: number;
};

type TransactionMetrics = {
  bytesRead: TransactionMetric;
  bytesWritten: TransactionMetric;
  databaseQueries: TransactionMetric;
  documentsRead: TransactionMetric;
  documentsWritten: TransactionMetric;
  functionsScheduled: TransactionMetric;
  scheduledFunctionArgsBytes: TransactionMetric;
};

export async function getTransactionMetrics(): Promise<TransactionMetrics> {
  const syscalls = (global as any).Convex;
  return JSON.parse(
    await syscalls.asyncSyscall(
      "1.0/getTransactionMetrics",
      JSON.stringify({}),
    ),
  );
}
