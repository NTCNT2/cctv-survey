'use client';

import type {
  CameraPoint,
  CreateCameraModelInput,
  CreateCameraPointInput,
  CreateProjectInput,
  CreateSiteInput,
  CreateUserInput,
  UpdateCameraModelInput,
  UpdateCameraPointInput,
  UpdatePhotoInput,
  UpdateProjectInput,
  UpdateSiteInput,
  UpdateUserInput,
} from '@cctv/shared';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { api } from './api';
import { uploadPhotos, type PhotoFailure, type PhotoUpload } from './photo';

export const PAGE_SIZE = 20;

export const keys = {
  projects: ['projects'] as const,
  project: (id: string) => ['project', id] as const,
  sites: (projectId: string) => ['sites', projectId] as const,
  site: (id: string) => ['site', id] as const,
  cameras: (projectId: string) => ['cameras', projectId] as const,
  camera: (id: string) => ['camera', id] as const,
  photos: (cameraId: string) => ['photos', cameraId] as const,
  cameraModels: (all: boolean) => ['camera-models', all] as const,
  users: ['users'] as const,
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
export const API_MAX_LIMIT = 500;

/**
 * Projects used for the overview. One less than the API maximum, so that the
 * extra row that detects "there are more" still fits in one request.
 */
export const OVERVIEW_LIMIT = API_MAX_LIMIT - 1;

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

/** `fresh`: always re-read on mount (an edit form must not start from a cached copy). */
export const useCamera = (id: string, opts?: { fresh?: boolean }) =>
  useQuery({
    queryKey: keys.camera(id),
    queryFn: () => api.cameras.get(id),
    ...(opts?.fresh && { refetchOnMount: 'always' as const }),
  });

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

/**
 * Quick Add: creates the point, then uploads its photos one by one. The point
 * is saved even if a photo fails (`photosFailed` > 0): photos can be added
 * later from the camera detail.
 */
export function useCreateCamera(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      body,
      photos = [],
      onPhotoProgress,
    }: {
      body: CreateCameraPointInput;
      photos?: PhotoUpload[];
      onPhotoProgress?: (done: number) => void;
    }): Promise<{
      camera: CameraPoint;
      photosFailed: number;
      photoFailures: PhotoFailure[];
    }> => {
      const camera = await api.cameras.create(body);
      const { failed, failures } = await uploadPhotos(
        photos,
        (p, meta) => api.photos.upload(camera.id, p, meta),
        onPhotoProgress,
      );
      return { camera, photosFailed: failed, photoFailures: failures };
    },
    onSuccess: ({ camera }) => {
      qc.removeQueries({ queryKey: keys.camera(camera.id) });
      return qc.invalidateQueries({ queryKey: keys.cameras(projectId) });
    },
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

// ---------------------------------------------------------------------------
// Camera models (master data) and photos
// ---------------------------------------------------------------------------

/** Active models for the Quick Add pickers; `all` adds inactive ones (admin). */
export const useCameraModels = (all = false) =>
  useQuery({
    queryKey: keys.cameraModels(all),
    queryFn: () => api.cameraModels.list(all),
  });

export function useSaveCameraModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      v:
        | { id?: undefined; body: CreateCameraModelInput }
        | { id: string; body: UpdateCameraModelInput },
    ) =>
      v.id === undefined
        ? api.cameraModels.create(v.body)
        : api.cameraModels.update(v.id, v.body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['camera-models'] }),
  });
}

export const usePhotos = (cameraId: string) =>
  useQuery({
    queryKey: keys.photos(cameraId),
    queryFn: () => api.photos.list(cameraId),
  });

/** Photo list and counts on the camera (detail, list, map) change together. */
function invalidatePhotos(
  qc: ReturnType<typeof useQueryClient>,
  cameraId: string,
  projectId: string,
) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: keys.photos(cameraId) }),
    qc.invalidateQueries({ queryKey: keys.camera(cameraId) }),
    qc.invalidateQueries({ queryKey: keys.cameras(projectId) }),
  ]);
}

/** Adds photos to an existing point (shrunk first; see lib/photo.ts). */
export function useAddPhotos(cameraId: string, projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      items,
      onProgress,
    }: {
      items: PhotoUpload[];
      onProgress?: (done: number) => void;
    }) =>
      uploadPhotos(
        items,
        (p, meta) => api.photos.upload(cameraId, p, meta),
        onProgress,
      ),
    onSettled: () => invalidatePhotos(qc, cameraId, projectId),
  });
}

/** Photo type / caption of a saved photo. */
export function useUpdatePhoto(cameraId: string, projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdatePhotoInput }) =>
      api.photos.update(cameraId, id, body),
    onSuccess: () => invalidatePhotos(qc, cameraId, projectId),
  });
}

export function useDeletePhoto(cameraId: string, projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (photoId: string) => api.photos.remove(cameraId, photoId),
    onSuccess: () => invalidatePhotos(qc, cameraId, projectId),
  });
}

// ---------------------------------------------------------------------------
// Users (admin)
// ---------------------------------------------------------------------------

export const useUsers = () =>
  useQuery({ queryKey: keys.users, queryFn: api.users.list });

export function useSaveUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      v:
        | { id?: undefined; body: CreateUserInput }
        | { id: string; body: UpdateUserInput },
    ) =>
      v.id === undefined
        ? api.users.create(v.body)
        : api.users.update(v.id, v.body),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.users }),
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: (v: { id: string; newPassword: string }) =>
      api.users.resetPassword(v.id, v.newPassword),
  });
}
