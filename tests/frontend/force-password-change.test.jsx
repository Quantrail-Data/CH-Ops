import { fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import ForceChangePassword from '../../src/frontend/components/layout/ForceChangePassword'

const login = vi.hoisted(() => {

})

vi.mock('../../src/frontend/App', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    useAuth: () => ({
      auth: {

      },
      login,
      logout: vi.fn()
    })
  }
})

describe('Force change password Component', () => {
  it("Renders Component", () => {
    render(<ForceChangePassword />)
    expect(screen.getByText("Change Your Password")).toBeInTheDocument()
    expect(screen.getByText("Current Password")).toBeInTheDocument()
    expect(screen.getByText("New Password")).toBeInTheDocument()
    expect(screen.getByText("Confirm New Password")).toBeInTheDocument()
  })

  it("Displays Error in input validation", () => {
    render(<ForceChangePassword />)
    const inputs = Array.from(screen.getAllByDisplayValue(''))
    const currentPasswordInput = inputs.at(0)
    const newPasswordInput = inputs.at(1)
    const confirmPasswordInput = inputs.at(2)

    fireEvent.change(currentPasswordInput, { target: { value: 'testing-password' } })
    fireEvent.change(newPasswordInput, { target: { value: 'test-1' } })
    fireEvent.change(confirmPasswordInput, { target: { value: 'test-1' } })

    const submitBtn = screen.getByRole('button', { name: /submit|change|password/i })

    fireEvent.click(submitBtn)

    const alert = document.querySelector('.alert-banner.danger')

    expect(alert).toBeInTheDocument()
    expect(alert.textContent.trim()).toBe('New password must be at least 8 characters.')

    fireEvent.change(newPasswordInput, { target: { value: 'testing-password' } })
    fireEvent.change(confirmPasswordInput, { target: { value: 'testing-password' } })
    fireEvent.click(submitBtn)
    expect(alert).toBeInTheDocument()
    expect(alert.textContent.trim()).toBe('New password must be different from current password.')



    fireEvent.change(newPasswordInput, { target: { value: 'testing-password' } })
    fireEvent.change(confirmPasswordInput, { target: { value: 'testing-different' } })
    fireEvent.click(submitBtn)
    expect(alert).toBeInTheDocument()
    expect(alert.textContent.trim()).toBe('Passwords do not match.')


    const random257 = "+kxuNW@]UZqZJB<w|,,m}pjnwzGb@bFX4M{I05)l0.3dnaEcwqQ1zq%|rJq4(lV]w!91ZPHICN^Z3GiK8!0G(SuiKNH05JrDIl-sC7MGdKE=]_n:_oFD#@9PjsHx<;i4+kxuNW@]UZqZJB<w|,,m}pjnwzGb@bFX4M{I05)l0.3dnaEcwqQ1zq%|rJq4(lV]w!91ZPHICN^Z3GiK8!0G(SuiKNH05JrDIl-sC7MGdKE=]_n:_oFD#@9PjsHx<;i4";
    fireEvent.change(newPasswordInput, { target: { value: `testing-${random257}` } })
    fireEvent.change(confirmPasswordInput, { target: { value: `testing-${random257}` } })
    fireEvent.click(submitBtn)
    expect(alert).toBeInTheDocument()
    expect(alert.textContent.trim()).toBe('New password must not exceed 256 characters.')

  })

  it("Changes password", () => {

  })

})