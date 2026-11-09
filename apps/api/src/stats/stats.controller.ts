import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { statsQuerySchema, type StatsQuery, type StatsSummary } from '@myfinances/shared';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceGuard } from '../workspaces/workspace.guard';
import { CurrentWorkspace, type WorkspaceContext } from '../common/request-context';
import { addDays, formatIsoDate, parseIsoDate } from '../common/dates';

const MAX_RANGE_DAYS = 366;

@ApiTags('stats')
@ApiBearerAuth()
@UseGuards(WorkspaceGuard)
@Controller('workspaces/:workspaceId/stats')
export class StatsController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Totals for the dashboard. Only expenses in the workspace's base currency are summed;
   * multi-currency conversion comes later.
   */
  @Get('summary')
  async summary(
    @CurrentWorkspace() ws: WorkspaceContext,
    @Query({ schema: statsQuerySchema }) q: StatsQuery,
  ): Promise<StatsSummary> {
    const from = parseIsoDate(q.from);
    const to = parseIsoDate(q.to);
    if (from > to) throw new BadRequestException('"from" must be before "to"');
    const days = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
    if (days > MAX_RANGE_DAYS) throw new BadRequestException(`Range cannot exceed ${MAX_RANGE_DAYS} days`);

    const where = {
      workspaceId: ws.workspaceId,
      currency: ws.baseCurrency,
      date: { gte: from, lte: to },
    };

    const [agg, byCategory, byDay, categories] = await Promise.all([
      this.prisma.expense.aggregate({ where, _sum: { amountMinor: true }, _count: true }),
      this.prisma.expense.groupBy({ by: ['categoryId'], where, _sum: { amountMinor: true } }),
      this.prisma.expense.groupBy({ by: ['date'], where, _sum: { amountMinor: true } }),
      this.prisma.category.findMany({
        where: { workspaceId: ws.workspaceId },
        select: { id: true, name: true, color: true },
      }),
    ]);

    const catById = new Map(categories.map((c) => [c.id, c]));
    const dayTotals = new Map(byDay.map((d) => [formatIsoDate(d.date), Number(d._sum.amountMinor ?? 0)]));

    return {
      currency: ws.baseCurrency,
      from: q.from,
      to: q.to,
      totalMinor: Number(agg._sum.amountMinor ?? 0),
      count: agg._count,
      byCategory: byCategory
        .map((row) => {
          const cat = row.categoryId ? catById.get(row.categoryId) : undefined;
          return {
            categoryId: row.categoryId,
            name: cat?.name ?? 'Uncategorized',
            color: cat?.color ?? null,
            totalMinor: Number(row._sum.amountMinor ?? 0),
          };
        })
        .sort((a, b) => b.totalMinor - a.totalMinor),
      byDay: Array.from({ length: days }, (_, i) => {
        const date = formatIsoDate(addDays(from, i));
        return { date, totalMinor: dayTotals.get(date) ?? 0 };
      }),
    };
  }
}
