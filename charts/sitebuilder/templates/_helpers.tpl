{{/* Chart name, overridable. */}}
{{- define "app.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/* Fully qualified name: the release name, plus the chart name unless the release already contains it. */}}
{{- define "app.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{- define "app.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/* Labels shared by everything in the release. */}}
{{- define "app.labels" -}}
helm.sh/chart: {{ include "app.chart" . }}
app.kubernetes.io/name: {{ include "app.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ include "app.imageTag" . | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: {{ include "app.name" . }}
{{- end }}

{{- define "app.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "app.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/* image.tag, or the chart's appVersion when it's empty. */}}
{{- define "app.imageTag" -}}
{{- default .Chart.AppVersion .Values.image.tag }}
{{- end }}

{{/*
Per zone. Each of these takes a dict: (dict "root" $ "zone" "site") or "admin".
*/}}

{{/* <fullname>-site, <fullname>-admin: Deployment, ConfigMap, HPA and PDB names. */}}
{{- define "zone.fullname" -}}
{{- printf "%s-%s" (include "app.fullname" .root) .zone | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/* The admin Service is always admin.serviceName (decisions #78); the site's is <fullname>-site. */}}
{{- define "zone.serviceName" -}}
{{- if eq .zone "admin" }}
{{- .root.Values.admin.serviceName }}
{{- else }}
{{- include "zone.fullname" . }}
{{- end }}
{{- end }}

{{/* Selector labels: never change these after the first install, Deployments can't update them. */}}
{{- define "zone.selectorLabels" -}}
app.kubernetes.io/name: {{ include "app.name" .root }}
app.kubernetes.io/instance: {{ .root.Release.Name }}
app.kubernetes.io/component: {{ .zone }}
{{- end }}

{{- define "zone.labels" -}}
{{ include "app.labels" .root }}
app.kubernetes.io/component: {{ .zone }}
{{- end }}

{{- define "zone.image" -}}
{{- printf "%s/sitebuilder-%s:%s" .root.Values.image.registry .zone (include "app.imageTag" .root) }}
{{- end }}

{{/* The shared config with the zone's own on top, and MEDIA_LOCAL_DIR when a claim is mounted. */}}
{{- define "zone.config" -}}
{{- $values := index .root.Values .zone }}
{{- $config := merge (dict) $values.config .root.Values.config }}
{{- if .root.Values.media.local.existingClaim }}
{{- $_ := set $config "MEDIA_LOCAL_DIR" .root.Values.media.local.mountPath }}
{{- end }}
{{- toYaml $config }}
{{- end }}
