import { create } from 'zustand';

type IbErrorDialogParams = {
  title: string;
  description: React.ReactNode;
  error: unknown;
};
interface IbErrorDialogStore {
  params: IbErrorDialogParams | null;
  openDialog: (params: IbErrorDialogParams) => void;
  closeDialog: () => void;
}

export const useApErrorDialogStore = create<IbErrorDialogStore>((set) => ({
  params: null,
  openDialog: (params) => set({ params }),
  closeDialog: () => set({ params: null }),
}));
