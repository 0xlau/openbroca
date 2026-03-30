import React from 'react'
import { useForm } from '@tanstack/react-form'
import {
  Button,
  CardContent,
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  Input,
  TypographyH3,
  TypographyMuted
} from '@openbroca/ui'
import { useStore } from 'zustand'
import {
  aboutMeStore,
  defaultAboutMeSettings,
  type AboutMeSettings
} from '@renderer/stores/about-me-store'

function isSameProfile(left: AboutMeSettings, right: AboutMeSettings): boolean {
  return (
    left.nickname === right.nickname &&
    left.email === right.email &&
    left.occupation === right.occupation &&
    left.bio === right.bio
  )
}

function ProfileField({
  label,
  description,
  htmlFor,
  children
}: {
  label: string
  description?: string
  htmlFor: string
  children: React.ReactNode
}) {
  return (
    <Field>
      <FieldLabel htmlFor={htmlFor}>{label}</FieldLabel>
      <FieldContent>
        {children}
        {description && <FieldDescription>{description}</FieldDescription>}
      </FieldContent>
    </Field>
  )
}

export const AboutMe: React.FC = () => {
  const { data: savedProfile, isHydrated, update } = useStore(aboutMeStore)

  const form = useForm({
    defaultValues: defaultAboutMeSettings,
    onSubmit: async ({ value }) => {
      await update(value)
      form.reset(value)
    }
  })

  React.useEffect(() => {
    if (!isHydrated) {
      return
    }

    form.reset(savedProfile)
  }, [form, isHydrated, savedProfile])

  return (
    <form
      className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6"
      onSubmit={(event) => {
        event.preventDefault()
        event.stopPropagation()
        void form.handleSubmit()
      }}
    >
      <form.Subscribe selector={(state) => state}>
        {(state) => {
          const hasChanges = isHydrated && !isSameProfile(state.values, savedProfile)

          return (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <TypographyH3 className="text-left">About Me</TypographyH3>
                <TypographyMuted className="not-first:mt-2">
                  Share a few details so OpenBroca can keep your context and preferences in mind.
                </TypographyMuted>
              </div>
              {hasChanges ? (
                <Button
                  type="submit"
                  className="shrink-0 self-center"
                  disabled={state.isSubmitting}
                >
                  Save changes
                </Button>
              ) : null}
            </div>
          )
        }}
      </form.Subscribe>

      <div className="w-full">
        <CardContent className="px-0">
          <FieldGroup>
            <form.Field name="nickname">
              {(field) => (
                <ProfileField label="My nickname" htmlFor={field.name}>
                  <Input
                    id={field.name}
                    name={field.name}
                    value={field.state.value}
                    placeholder="Taylor"
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                  />
                </ProfileField>
              )}
            </form.Field>

            <form.Field name="email">
              {(field) => (
                <ProfileField
                  label="My email"
                  description="You can add the email you use most often. This helps more when drafting emails, follow-ups, or outreach messages."
                  htmlFor={field.name}
                >
                  <Input
                    id={field.name}
                    type="email"
                    name={field.name}
                    value={field.state.value}
                    placeholder="taylor@example.com"
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                  />
                </ProfileField>
              )}
            </form.Field>

            <form.Field name="occupation">
              {(field) => (
                <ProfileField
                  label="My occupation"
                  description="You can list more than one role, separated by commas, like engineer, founder, or researcher. This works better when the reply depends on your current perspective or responsibilities."
                  htmlFor={field.name}
                >
                  <Input
                    id={field.name}
                    name={field.name}
                    value={field.state.value}
                    placeholder="Engineer"
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                  />
                </ProfileField>
              )}
            </form.Field>

            <form.Field name="bio">
              {(field) => (
                <ProfileField
                  label="More about me"
                  description="You can include multiple interests, preferences, goals, or values, separated by commas or semicolons. This works better when you want more personalized suggestions, writing style, or trade-off decisions."
                  htmlFor={field.name}
                >
                  <Input
                    id={field.name}
                    name={field.name}
                    value={field.state.value}
                    placeholder="Clear trade-offs, concise writing, local-first tools, indie product building"
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                  />
                </ProfileField>
              )}
            </form.Field>
          </FieldGroup>
        </CardContent>
      </div>
    </form>
  )
}
