import React from 'react'
import { useForm } from '@tanstack/react-form'
import {
  Button,
  CardContent,
  CardFooter,
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  Input,
  Textarea,
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
  description: string
  htmlFor: string
  children: React.ReactNode
}) {
  return (
    <Field>
      <FieldLabel htmlFor={htmlFor}>{label}</FieldLabel>
      <FieldContent>
        {children}
        <FieldDescription>{description}</FieldDescription>
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
    <div className="flex flex-col gap-6 p-6">
      <div>
        <TypographyH3 className="text-left">About Me</TypographyH3>
        <TypographyMuted className="not-first:mt-2">
          Share a few details so OpenBroca can keep your context and preferences in mind.
        </TypographyMuted>
      </div>

      <form
        className="max-w-3xl"
        onSubmit={(event) => {
          event.preventDefault()
          event.stopPropagation()
          void form.handleSubmit()
        }}
      >
        <div className="max-w-3xl">
          <CardContent className="px-0">
            <FieldGroup>
              <form.Field name="nickname">
                {(field) => (
                  <ProfileField
                    label="My nickname"
                    description="How you would like to be addressed in prompts and summaries."
                    htmlFor={field.name}
                  >
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
                    description="Your primary email for drafts, follow-ups, and outreach context."
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
                    description="Engineer, student, founder, researcher, or anything else that fits."
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
                    description="Interests, values, or preferences to keep in mind."
                    htmlFor={field.name}
                  >
                    <Textarea
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      placeholder="I care about clear trade-offs, concise writing, and local-first tools."
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value)}
                    />
                  </ProfileField>
                )}
              </form.Field>
            </FieldGroup>
          </CardContent>

          <form.Subscribe selector={(state) => state}>
            {(state) => {
              if (!isHydrated || isSameProfile(state.values, savedProfile)) {
                return null
              }

              return (
                <CardFooter className="justify-end px-0">
                  <Button type="submit" disabled={state.isSubmitting}>
                    Save changes
                  </Button>
                </CardFooter>
              )
            }}
          </form.Subscribe>
        </div>
      </form>
    </div>
  )
}
