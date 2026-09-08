import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { isHostedClientAuthMode } from "@/lib/auth-mode";
import { getContentBriefSetupStatus } from "@/serverFunctions/content";

type ContentBriefAccess = {
  // Only true once the setup check has resolved to "no access" — mirrors
  // useSamAccess (src/client/features/sam/useSamAccess.ts).
  showSetupGate: boolean;
  errorMessage: string | null;
  isRefetching: boolean;
  onRetry: () => void;
};

export function useContentBriefAccess(projectId: string): ContentBriefAccess {
  const isHosted = isHostedClientAuthMode();

  const { data, error, isRefetching, refetch } = useQuery({
    queryKey: ["contentBriefSetupStatus", projectId],
    queryFn: () => getContentBriefSetupStatus({ data: { projectId } }),
    enabled: !isHosted,
    refetchOnWindowFocus: false,
    staleTime: 60 * 1000,
  });

  const onRetry = useCallback(() => {
    void refetch();
  }, [refetch]);

  if (isHosted) {
    return {
      showSetupGate: false,
      errorMessage: null,
      isRefetching: false,
      onRetry,
    };
  }

  const resolved = data !== undefined || error != null;
  return {
    showSetupGate: resolved && !(data?.enabled ?? false),
    errorMessage:
      data?.errorMessage ??
      (error
        ? getStandardErrorMessage(
            error,
            "Could not load Content Brief setup status.",
          )
        : null),
    isRefetching,
    onRetry,
  };
}
