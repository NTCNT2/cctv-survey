'use client';

import type {
  CreateCameraPointInput,
  CreateProjectInput,
  CreateSiteInput,
  UpdateCameraPointInput,
  UpdateProjectInput,
  UpdateSiteInput,
} from '@cctv/shared';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { api } from './api';

export const PAGE_SIZE = 20;

export const keys = {
  projects: ['projects'] as const,
  project: (id: string) => ['project', id] as const,
  sites: (projectId: string) => ['sites', projectId] as const,
  site: (id: string) => ['site', id] as const,
  cameras: (projectId: string) => ['cameras', projectId] as const,
  camera: (id: string) => ['camera', id] as const,
};

/**
 * Newest projects first, PAGE_SIZE at a time. Asks for one extra row to know
 * whether another page exists (the API returns no total count).
 */
export function useProjects() {
  return useInfiniteQuery({
    queryKey: keys.projects,
    initialPageParam: 0,
    queryFn: ({ pageParam }) => api.projects.list(PAGE_SIZE + 1, pageParam),
    getNextPageParam: (last, _all, lastOffset) =>
      last.length > PAGE_SIZE ? lastOffset + PAGE_SIZE : undefined,
    select: (data) => data.pages.flatMap((p) => p.slice(0, PAGE_SIZE)),
  });
}

/** Largest page the API serves (GET /projects?limit ≤ 500). */
export const OVERVIEW_LIMIT = 500;

/**
 * Up to OVERVIEW_LIMIT projects in one request, for the summary cards and
 * search / filters (the API has no counts or server-side filtering).
 * `truncated` is true when there are more than that.
 */
export function useProjectOverview() {
  return useQuery({
    queryKey: [...keys.projects, 'overview'] as const,
    queryFn: () => api.projects.list(OVERVIEW_LIMIT + 1, 0),
    select: (rows) => ({
      projects: rows.slice(0, OVERVIEW_LIMIT),
      truncated: rows.length > OVERVIEW_LIMIT,
    }),
  });
}

export const useProject = (id: string) =>
  useQuery({ queryKey: keys.project(id), queryFn: () => api.projects.get(id) });

export const useSites = (projectId: string) =>
  useQuery({
    queryKey: keys.sites(projectId),
    queryFn: () => api.sites.list(projectId),
  });

export const useSite = (id: string) =>
  useQuery({ queryKey: keys.site(id), queryFn: () => api.sites.get(id) });

export const useCameras = (projectId: string) =>
  useQuery({
    queryKey: keys.cameras(projectId),
    queryFn: () => api.cameras.list(projectId),
  });

export const useCamera = (id: string) =>
  useQuery({ queryKey: keys.camera(id), queryFn: () => api.cameras.get(id) });

// ---------------------------------------------------------------------------
// Mutations: each refreshes the lists and details it can affect.
// ---------------------------------------------------------------------------

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateProjectInput) => api.projects.create(body),
    onSuccess: (p) => {
      qc.setQueryData(keys.project(p.id), p);
      return qc.invalidateQueries({ queryKey: keys.projects });
    },
  });
}

export function useUpdateProject(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateProjectInput) => api.projects.update(id, body),
    onSuccess: (p) => {
      qc.setQueryData(keys.project(id), p);
      return qc.invalidateQueries({ queryKey: keys.projects });
    },
  });
}

export function useDeleteProject(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.projects.remove(id),
    onSuccess: () => {
      qc.removeQueries({ queryKey: keys.project(id) });
      return qc.invalidateQueries({ queryKey: keys.projects });
    },
  });
}

export function useCreateSite(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateSiteInput) => api.sites.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.sites(projectId) }),
  });
}

export function useUpdateSite(id: string, projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateSiteInput) => api.sites.update(id, body),
    onSuccess: (s) => {
      qc.setQueryData(keys.site(id), s);
      return qc.invalidateQueries({ queryKey: keys.sites(projectId) });
    },
  });
}

export function useDeleteSite(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.sites.remove(id),
    onSuccess: (_v, id) => {
      qc.removeQueries({ queryKey: keys.site(id) });
      return qc.invalidateQueries({ queryKey: keys.sites(projectId) });
    },
  });
}

export function useCreateCamera(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateCameraPointInput) => api.cameras.create(body),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: keys.cameras(projectId) }),
  });
}

export function useUpdateCamera(id: string, projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateCameraPointInput) => api.cameras.update(id, body),
    onSuccess: (c) => {
      qc.setQueryData(keys.camera(id), c);
      return qc.invalidateQueries({ queryKey: keys.cameras(projectId) });
    },
  });
}

export function useDeleteCamera(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.cameras.remove(id),
    onSuccess: (_v, id) => {
      qc.removeQueries({ queryKey: keys.camera(id) });
      return qc.invalidateQueries({ queryKey: keys.cameras(projectId) });
    },
  });
}
