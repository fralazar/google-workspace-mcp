import { loadServiceAccountKey } from '../../accounts/service-account.js';
import { getAccessToken, invalidateToken } from '../../accounts/token-service.js';
import { nextSteps } from '../formatting/next-steps.js';
import { getActivePolicies } from '../../factory/safety.js';
import { manifest } from '../../factory/registry.js';
import { checkWorkspaceStatus } from '../../executor/workspace.js';
import type { HandlerResponse } from '../handler.js';

export async function handleAccounts(params: Record<string, unknown>): Promise<HandlerResponse> {
  const operation = params.operation as string;
  const key = loadServiceAccountKey();

  switch (operation) {
    case 'list': {
      return {
        text: [
          '## Service Account Mode',
          '',
          `**Service Account:** ${key.client_email}`,
          `**Project:** ${key.project_id}`,
          '',
          'Domain-wide delegation is active. Any user in the domain can be impersonated by passing their email in tool calls.',
        ].join('\n') + nextSteps('accounts', 'list'),
        refs: {
          mode: 'service_account',
          serviceAccount: key.client_email,
          projectId: key.project_id,
        },
      };
    }

    case 'status': {
      const email = params.email as string;
      if (!email) throw new Error('email is required for status');
      try {
        await getAccessToken(email);
        return {
          text: [
            `## Account Status: ${email}`,
            '',
            '[x] Token valid — delegation working',
            `**Service Account:** ${key.client_email}`,
          ].join('\n') + nextSteps('accounts', 'status', { email }),
          refs: { email, tokenValid: true, serviceAccount: key.client_email },
        };
      } catch (err) {
        return {
          text: [
            `## Account Status: ${email}`,
            '',
            `[ ] Token failed: ${(err as Error).message}`,
            '',
            'Verify that domain-wide delegation is configured in Google Admin Console ' +
            `for service account ${key.client_email} with the required scopes.`,
          ].join('\n'),
          refs: { email, tokenValid: false, error: (err as Error).message },
        };
      }
    }

    case 'refresh': {
      const email = params.email as string;
      if (!email) throw new Error('email is required for refresh');
      invalidateToken(email);
      await getAccessToken(email);
      return {
        text: `Token refreshed for ${email}` + nextSteps('accounts', 'refresh', { email }),
        refs: { status: 'refreshed', email },
      };
    }

    case 'capabilities': {
      const policies = getActivePolicies();
      const services = Object.entries(manifest.services).map(([name, def]) => ({
        service: name,
        tool: def.tool_name,
        operations: Object.keys(def.operations),
      }));
      const workspace = checkWorkspaceStatus();

      const parts: string[] = [];

      const totalOps = services.reduce((sum, s) => sum + s.operations.length, 0);
      parts.push(`## Services (${services.length} services, ${totalOps} operations)\n`);
      for (const s of services) {
        parts.push(`**${s.tool}** (${s.operations.length}): ${s.operations.join(', ')}`);
      }

      parts.push('');
      parts.push('## Auth Mode\n');
      parts.push(`**Mode:** Service Account (domain-wide delegation)`);
      parts.push(`**Service Account:** ${key.client_email}`);

      parts.push('');
      if (policies.length > 0) {
        parts.push(`## Safety Policies (${policies.length} active)\n`);
        for (const p of policies) {
          parts.push(`- **${p.name}**: ${p.description}`);
        }
      } else {
        parts.push('## Safety Policies\n\nNo safety policies active — all operations are allowed.');
      }

      parts.push('');
      parts.push('## Workspace Directory\n');
      parts.push(`**Path:** ${workspace.path}`);
      parts.push(`**Status:** ${workspace.valid ? 'valid' : 'invalid — ' + workspace.warning}`);

      return {
        text: parts.join('\n'),
        refs: {
          totalServices: services.length,
          totalOperations: totalOps,
          activePolicies: policies.map(p => p.name),
          workspacePath: workspace.path,
          workspaceValid: workspace.valid,
          authMode: 'service_account',
          serviceAccount: key.client_email,
        },
      };
    }

    case 'authenticate':
      return {
        text: 'Authentication is managed via service account domain-wide delegation. ' +
              'No manual OAuth flow is needed. Use any domain email directly in tool calls.',
        refs: { mode: 'service_account' },
      };

    case 'remove':
      return {
        text: 'Account removal is not applicable in service account mode. ' +
              'Any domain user can be impersonated without registration.',
        refs: { mode: 'service_account' },
      };

    case 'scopes':
      return {
        text: 'Scopes are configured in the Google Admin Console under ' +
              'Security > API controls > Domain-wide delegation. ' +
              `Service account client ID: ${key.client_id}`,
        refs: { mode: 'service_account', clientId: key.client_id },
      };

    default:
      throw new Error(`Unknown accounts operation: ${operation}`);
  }
}
