export interface HelpFormField {
  id: string
  label: string
  type: 'text' | 'email' | 'textarea'
  placeholder: string
  defaultValue: string
  wrapperClassName: string
}

export const helpFormFields: HelpFormField[] = [
  {
    id: 'floatingssName',
    label: 'NAME',
    type: 'text',
    placeholder: 'first',
    defaultValue: 'founder',
    wrapperClassName: 'form-floating mb-3 d-flex align-items-end',
  },
  {
    id: 'floatingEmail',
    label: 'EMAIL',
    type: 'email',
    placeholder: 'iamosahan@gmail.com',
    defaultValue: 'iamosahan@gmail.com',
    wrapperClassName: 'form-floating mb-3 d-flex align-items-center',
  },
  {
    id: 'floatingPassd',
    label: 'TEXT',
    type: 'textarea',
    placeholder: 'request',
    defaultValue: '',
    wrapperClassName: 'form-floating mb-3 d-flex align-items-center',
  },
]
