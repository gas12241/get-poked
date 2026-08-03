import { useQuery } from '@tanstack/react-query';
import { getHealth } from '../api/health';

function HealthCheck() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['health'],
    queryFn: getHealth,
  });

  if (isLoading) return <p>Checking backend connection...</p>;
  if (isError) return <p>Backend unreachable: {(error as Error).message}</p>;
  return <p>Backend status: {data?.status}</p>;
}

export default HealthCheck;
