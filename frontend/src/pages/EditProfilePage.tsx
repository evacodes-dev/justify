import RightSidebar from '../components/layout/RightSidebar'

interface ProfileField {
  id: string
  type: string
  label: string
  placeholder: string
  defaultValue: string
  alignEnd?: boolean
}

const profileFields: ProfileField[] = [
  { id: 'floatingssName', type: 'text', label: 'NAME', placeholder: 'first', defaultValue: 'founder', alignEnd: true },
  { id: 'floatingBirth', type: 'text', label: 'DATE OF BIRTH', placeholder: 'DATE OF BIRTH', defaultValue: '01/12/21' },
  { id: 'floatingEmail', type: 'email', label: 'EMAIL', placeholder: 'iamosahan@gmail.com', defaultValue: 'iamosahan@gmail.com' },
  { id: 'floatingPassd', type: 'password', label: 'PASSWORD', placeholder: 'password', defaultValue: '12345678' },
]

interface GenderOption {
  id: string
  label: string
  defaultChecked?: boolean
  wrapperClassName: string
}

const genderOptions: GenderOption[] = [
  { id: 'male', label: 'Male', wrapperClassName: 'form-check' },
  { id: 'female', label: 'Female', wrapperClassName: 'form-check mx-3' },
  { id: 'not', label: 'Prefer not to say', defaultChecked: true, wrapperClassName: 'form-check' },
]

interface AppSetting {
  id: string
  label: string
  rowClassName: string
}

const appSettings: AppSetting[] = [
  { id: 'flexSwitchCheckDefault', label: 'AUTOPLAY VIDEOS ON FEED', rowClassName: 'border-bottom py-3 d-flex align-items-center mb-0' },
  { id: 'flexSwitchCheckDsefault', label: 'NOTIFICATIONS', rowClassName: 'pt-3 d-flex align-items-center mb-0' },
]

function FloatingField({ field }: { field: ProfileField }) {
  return (
    <div className={`form-floating mb-3 d-flex ${field.alignEnd ? 'align-items-end' : 'align-items-center'}`}>
      <input
        type={field.type}
        className="form-control rounded-5 bg-glass"
        id={field.id}
        defaultValue={field.defaultValue}
        placeholder={field.placeholder}
      />
      <label htmlFor={field.id} className="text-muted">{field.label}</label>
    </div>
  )
}

export default function EditProfilePage() {
  return (
    <>
      <main className="col col-xl-6 order-xl-2 col-lg-12 order-lg-1 col-md-12 col-sm-12 col-12">
        <div className="main-content p-lg-3 border-start border-end">
          <div className="mb-5">
            <header className="profile d-flex align-items-center">
              <img alt="#" src="/img/images.jpeg" className="rounded-circle me-3" />
              <div>
                <span className="text-muted text_short">WELCOME 👋</span>
                <h4 className="mb-0 text-white"><span className="fw-bold">@founder</span></h4>
              </div>
            </header>
          </div>
          {/* Feeds */}
          <div className="feeds">
            {/* Feed Item */}
            <div className="bg-glass p-4 feed-item rounded-4 shadow-sm mb-3 faq-page">
              <div className="mb-3">
                <h5 className="lead fw-bold text-body mb-0">Edit Profile</h5>
              </div>
              <div className="row justify-content-center">
                <div className="col-lg-12">
                  <form action="/profile">
                    {profileFields.map((field) => (
                      <FloatingField key={field.id} field={field} />
                    ))}
                    <label className="mb-2 text-muted small">GENDER</label>
                    <div className="d-flex align-items-center mb-3 px-0">
                      {genderOptions.map((option) => (
                        <div className={option.wrapperClassName} key={option.id}>
                          <input
                            className="form-check-input"
                            type="radio"
                            name="flexRadioDefault"
                            id={option.id}
                            defaultChecked={option.defaultChecked}
                          />
                          <label className="form-check-label" htmlFor={option.id}>
                            {option.label}
                          </label>
                        </div>
                      ))}
                    </div>
                    <div className="d-grid">
                      <button className="btn btn-primary rounded-5 w-100 text-decoration-none py-3 fw-bold text-uppercase m-0">SAVE</button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
            <div className="bg-glass p-4 feed-item rounded-4 shadow-sm faq-page mb-3">
              <div className="mb-3">
                <h5 className="lead fw-bold text-body mb-0">Confirm your password
                </h5>
                <p className="mb-0">Please enter your password in order to get this.
                </p>
              </div>
              <div className="row justify-content-center">
                <div className="col-lg-12">
                  <form action="/profile">
                    <div className="form-floating mb-3 d-flex align-items-center">
                      <input type="password" className="form-control rounded-5" id="floatingPass" placeholder="password" defaultValue="12345678" />
                      <label htmlFor="floatingPass" className="text-muted">PASSWORD</label>
                    </div>
                    <div className="d-grid">
                      <button className="btn btn-primary w-100 text-decoration-none rounded-5 py-3 fw-bold text-uppercase m-0">Confirm</button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
            <div className="bg-glass p-4 feed-item rounded-4 shadow-sm faq-page">
              <div className="mb-3">
                <h5 className="lead fw-bold text-body mb-0">APP SETTINGS
                </h5>
              </div>
              <div className="row justify-content-center">
                <div className="col-lg-12">
                  {appSettings.map((setting) => (
                    <p className={setting.rowClassName} key={setting.id}>
                      <span>{setting.label}</span>
                      <span className="ms-auto form-check form-switch">
                        <input className="form-check-input mt-2 ms-0" type="checkbox" id={setting.id} />
                      </span>
                    </p>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
      <RightSidebar />
    </>
  )
}
