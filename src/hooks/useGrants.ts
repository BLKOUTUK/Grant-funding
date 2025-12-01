/**
 * useGrants Hook
 * React hook for grant funding management
 * Connects UI to live Supabase data - NO MOCK DATA
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import type {
  Grant,
  Priority,
  OpportunityPipeline,
  BidWritingProgress,
  BidWritingTemplate,
} from '@/types';

// Pipeline summary type
interface PipelineSummary {
  totalGrants: number;
  totalRequested: number;
  totalAwarded: number;
  successRate: number;
  activeApplications: number;
  upcomingDeadlines: number;
}

export function useGrants() {
  const [grants, setGrants] = useState<Grant[]>([]);
  const [opportunities, setOpportunities] = useState<OpportunityPipeline[]>([]);
  const [bidProgress, setBidProgress] = useState<BidWritingProgress[]>([]);
  const [pipelineSummary, setPipelineSummary] = useState<PipelineSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchGrants = useCallback(async (): Promise<Grant[]> => {
    if (!isSupabaseConfigured()) {
      throw new Error('Supabase not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables.');
    }

    const { data, error: fetchError } = await supabase
      .from('grants')
      .select('*')
      .is('deleted_at', null)
      .order('deadline_date', { ascending: true });

    if (fetchError) throw fetchError;
    return data || [];
  }, []);

  const fetchOpportunities = useCallback(async (): Promise<OpportunityPipeline[]> => {
    if (!isSupabaseConfigured()) {
      throw new Error('Supabase not configured.');
    }

    const { data, error: fetchError } = await supabase
      .from('opportunity_pipeline')
      .select('*');

    if (fetchError) throw fetchError;
    return data || [];
  }, []);

  const fetchBidProgress = useCallback(async (): Promise<BidWritingProgress[]> => {
    if (!isSupabaseConfigured()) {
      throw new Error('Supabase not configured.');
    }

    const { data, error: fetchError } = await supabase
      .from('bid_writing_progress')
      .select('*');

    if (fetchError) throw fetchError;
    return data || [];
  }, []);

  const calculatePipelineSummary = useCallback((grantsList: Grant[]): PipelineSummary => {
    const totalRequested = grantsList.reduce((sum, g) => sum + (Number(g.amount_requested) || 0), 0);
    const totalAwarded = grantsList.reduce((sum, g) => sum + (Number(g.amount_awarded) || 0), 0);
    const awardedCount = grantsList.filter(g => g.status === 'awarded').length;
    const decidedCount = grantsList.filter(g => ['awarded', 'declined'].includes(g.status)).length;
    const activeApplications = grantsList.filter(g =>
      ['researching', 'eligible', 'preparing', 'submitted', 'under_review'].includes(g.status)
    ).length;

    // Count grants with deadlines in next 30 days
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    const upcomingDeadlines = grantsList.filter(g => {
      if (!g.deadline_date) return false;
      const deadline = new Date(g.deadline_date);
      return deadline <= thirtyDaysFromNow && deadline >= new Date();
    }).length;

    return {
      totalGrants: grantsList.length,
      totalRequested,
      totalAwarded,
      successRate: decidedCount > 0 ? (awardedCount / decidedCount) * 100 : 0,
      activeApplications,
      upcomingDeadlines,
    };
  }, []);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [grantsData, opportunitiesData, bidProgressData] = await Promise.all([
        fetchGrants(),
        fetchOpportunities(),
        fetchBidProgress(),
      ]);

      setGrants(grantsData);
      setOpportunities(opportunitiesData);
      setBidProgress(bidProgressData);
      setPipelineSummary(calculatePipelineSummary(grantsData));
    } catch (err) {
      console.error('Error fetching grant data:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch grant data');
      // Clear data on error - no mock fallback
      setGrants([]);
      setOpportunities([]);
      setBidProgress([]);
      setPipelineSummary(null);
    } finally {
      setLoading(false);
    }
  }, [fetchGrants, fetchOpportunities, fetchBidProgress, calculatePipelineSummary]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const refetch = () => {
    fetchAll();
  };

  // Filter grants by status
  const getGrantsByStatus = useCallback((status: string | string[]) => {
    const statuses = Array.isArray(status) ? status : [status];
    return grants.filter(g => statuses.includes(g.status));
  }, [grants]);

  // Filter grants by priority
  const getGrantsByPriority = useCallback((priority: Priority | Priority[]) => {
    const priorities = Array.isArray(priority) ? priority : [priority];
    return grants.filter(g => priorities.includes(g.priority));
  }, [grants]);

  // Get upcoming deadlines
  const getUpcomingDeadlines = useCallback((days: number = 30) => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + days);

    return grants
      .filter(g => {
        if (!g.deadline_date) return false;
        const deadline = new Date(g.deadline_date);
        return deadline <= cutoff && deadline >= new Date();
      })
      .sort((a, b) => {
        const dateA = new Date(a.deadline_date!).getTime();
        const dateB = new Date(b.deadline_date!).getTime();
        return dateA - dateB;
      });
  }, [grants]);

  return {
    // Data
    grants,
    opportunities,
    bidProgress,
    pipelineSummary,

    // State
    loading,
    error,

    // Actions
    refetch,

    // Utility functions
    getGrantsByStatus,
    getGrantsByPriority,
    getUpcomingDeadlines,
  };
}

// Hook for fetching a single grant with details
export function useGrant(grantId: string) {
  const [grant, setGrant] = useState<Grant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchGrant = async () => {
      try {
        setLoading(true);
        setError(null);

        if (!isSupabaseConfigured()) {
          throw new Error('Supabase not configured.');
        }

        const { data, error: fetchError } = await supabase
          .from('grants')
          .select('*')
          .eq('id', grantId)
          .is('deleted_at', null)
          .single();

        if (fetchError && fetchError.code !== 'PGRST116') throw fetchError;
        setGrant(data);
      } catch (err) {
        console.error('Error fetching grant:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch grant');
      } finally {
        setLoading(false);
      }
    };

    if (grantId) {
      fetchGrant();
    }
  }, [grantId]);

  return { grant, loading, error };
}

// Hook for bid writing templates
export function useTemplates() {
  const [templates, setTemplates] = useState<BidWritingTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        setLoading(true);
        setError(null);

        if (!isSupabaseConfigured()) {
          throw new Error('Supabase not configured.');
        }

        const { data, error: fetchError } = await supabase
          .from('bid_writing_templates')
          .select('*')
          .eq('is_active', true)
          .order('times_used', { ascending: false });

        if (fetchError) throw fetchError;
        setTemplates(data || []);
      } catch (err) {
        console.error('Error fetching templates:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch templates');
      } finally {
        setLoading(false);
      }
    };

    fetchTemplates();
  }, []);

  return { templates, loading, error };
}
