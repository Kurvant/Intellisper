import {
  Template,
  TemplateTelemetryEventType,
  TemplateType,
  UncategorizedFolderId,
} from '@intelblocks/shared';
import { t } from 'i18next';
import { Plus } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import { PageHeader } from '@/components/custom/page-header';
import { SearchInput } from '@/components/custom/search-input';
import { Button } from '@/components/ui/button';
import { flowHooks } from '@/features/flows';
import { templatesTelemetryApi, templatesHooks } from '@/features/templates';
import { platformHooks } from '@/hooks/platform-hooks';
import { cn, DASHBOARD_CONTENT_PADDING_X } from '@/lib/utils';

import { AllCategoriesView } from './all-categories-view';
import { CategoryFilterCarousel } from './category-filter-carousel';
import { EmptyTemplatesView } from './empty-templates-view';
import { SelectedCategoryView } from './selected-category-view';

const TemplatesPage = ({
  variant = 'default',
}: {
  variant?: 'default' | 'overhaul';
} = {}) => {
  const isOverhaul = variant === 'overhaul';
  const navigate = useNavigate();
  const { data: templateCategories } = templatesHooks.useTemplateCategories();
  const { platform } = platformHooks.useCurrentPlatform();
  const isShowingOfficialTemplates = !platform.plan.manageTemplatesEnabled;
  const { templates, isLoading, search, setSearch, category, setCategory } =
    templatesHooks.useTemplates(
      isShowingOfficialTemplates ? TemplateType.OFFICIAL : TemplateType.CUSTOM,
    );
  const selectedCategory = category as string;
  const { data: allOfficialTemplates, isLoading: isAllTemplatesLoading } =
    templatesHooks.useAllOfficialTemplates();
  const { mutate: createFlow, isPending: isCreateFlowPending } =
    flowHooks.useStartFromScratch(UncategorizedFolderId);

  const handleSearchChange = (value: string) => {
    setSearch(value);
  };

  const handleTemplateSelect = useCallback(
    (template: Template) => {
      navigate(
        isOverhaul
          ? `/build/explore/${template.id}`
          : `/templates/${template.id}`,
      );
      if (template.type === TemplateType.OFFICIAL) {
        templatesTelemetryApi.sendEvent({
          eventType: TemplateTelemetryEventType.VIEW,
          templateId: template.id,
        });
      }
    },
    [navigate, isOverhaul],
  );

  const templatesByCategory = useMemo(() => {
    const grouped: Record<string, Template[]> = {} as Record<
      string,
      Template[]
    >;

    if (isShowingOfficialTemplates) {
      allOfficialTemplates?.forEach((template: Template) => {
        if (template.categories?.length) {
          template.categories?.forEach((category: string) => {
            if (!grouped[category]) {
              grouped[category] = [];
            }
            grouped[category].push(template);
          });
        }
      });
    }

    return grouped;
  }, [allOfficialTemplates, isShowingOfficialTemplates]);

  const categories = useMemo(() => {
    return ['All', ...(templateCategories || [])];
  }, [templateCategories]);

  const selectedCategoryTemplates = useMemo(() => {
    if (selectedCategory === 'All') {
      return templates || [];
    }
    return templatesByCategory[selectedCategory] || [];
  }, [selectedCategory, templates, templatesByCategory]);

  const showLoading =
    isLoading || (isShowingOfficialTemplates && isAllTemplatesLoading);
  const showAllCategories =
    isShowingOfficialTemplates && selectedCategory === 'All';
  const hasTemplates = templates && templates.length > 0;
  const showCategoryTitleForOfficialTemplates =
    isShowingOfficialTemplates && selectedCategory !== 'All';

  return (
    <div>
      <div>
        <div
          className={cn(
            'sticky top-0 z-10 bg-background',
            isOverhaul && 'top-0',
          )}
        >
          {isOverhaul ? (
            <div className="flex flex-wrap items-center gap-2 pb-2">
              <div className="w-[260px] max-w-xs">
                <SearchInput
                  value={search}
                  onChange={handleSearchChange}
                  placeholder={t('Search templates by name or description')}
                ></SearchInput>
              </div>
              <div className="ml-auto">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 gap-1.5 rounded-lg"
                  onClick={() => createFlow()}
                  disabled={isCreateFlowPending}
                >
                  <Plus className="w-4 h-4" />
                  {t('Start from scratch')}
                </Button>
              </div>
            </div>
          ) : (
            <PageHeader
              showSidebarToggle={true}
              className="static"
              title={
                <>
                  <div className="flex flex-row w-full justify-between gap-1">
                    <SearchInput
                      value={search}
                      onChange={handleSearchChange}
                      placeholder={t('Search templates by name or description')}
                    ></SearchInput>
                    <div className="flex flex-row justify-end w-[50%]">
                      <Button
                        variant="outline"
                        className="gap-2 h-full"
                        onClick={() => createFlow()}
                        disabled={isCreateFlowPending}
                      >
                        <Plus className="w-4 h-4" />
                        {t('Start from scratch')}
                      </Button>
                    </div>
                  </div>
                </>
              }
            ></PageHeader>
          )}

          {isShowingOfficialTemplates && categories && (
            <CategoryFilterCarousel
              categories={categories}
              selectedCategory={selectedCategory}
              onCategorySelect={setCategory}
            />
          )}
        </div>
        <div className={isOverhaul ? '' : DASHBOARD_CONTENT_PADDING_X}>
          {!hasTemplates && !showLoading ? (
            <EmptyTemplatesView />
          ) : showAllCategories ? (
            <AllCategoriesView
              templatesByCategory={templatesByCategory}
              categories={categories}
              onCategorySelect={setCategory}
              onTemplateSelect={handleTemplateSelect}
              isLoading={showLoading}
              hideHeader={!isShowingOfficialTemplates}
            />
          ) : (
            <SelectedCategoryView
              category={selectedCategory}
              templates={selectedCategoryTemplates}
              onTemplateSelect={handleTemplateSelect}
              isLoading={showLoading}
              showCategoryTitle={showCategoryTitleForOfficialTemplates}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export { TemplatesPage };
